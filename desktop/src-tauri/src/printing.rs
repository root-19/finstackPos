//! Raw printing to Windows printers through the print spooler.
//!
//! The web app builds ESC/POS bytes (resources/js/lib/escpos.ts) and we hand
//! them to the printer's driver untouched (datatype "RAW"), so any thermal
//! printer installed in Windows works: USB, network or Bluetooth.

#[tauri::command]
pub fn list_printers() -> Result<Vec<String>, String> {
    imp::list()
}

#[tauri::command]
pub fn default_printer() -> Option<String> {
    imp::default()
}

/// Async so a slow or offline printer never freezes the window.
#[tauri::command]
pub async fn print_raw(printer: String, data: Vec<u8>) -> Result<(), String> {
    if data.is_empty() {
        return Err("Nothing to print".into());
    }
    imp::print(&printer, &data)
}

#[cfg(windows)]
mod imp {
    // Declared by hand against winspool.drv (stable Win32 ABI) instead of
    // pulling in the `windows` crate for six functions.
    use std::ffi::c_void;
    use std::iter::once;
    use std::ptr::{null, null_mut};

    #[repr(C)]
    struct DocInfo1W {
        doc_name: *const u16,
        output_file: *const u16,
        datatype: *const u16,
    }

    #[repr(C)]
    struct PrinterInfo4W {
        printer_name: *const u16,
        server_name: *const u16,
        attributes: u32,
    }

    const PRINTER_ENUM_LOCAL: u32 = 0x0000_0002;
    const PRINTER_ENUM_CONNECTIONS: u32 = 0x0000_0004;

    type Handle = *mut c_void;

    #[link(name = "winspool")]
    extern "system" {
        fn OpenPrinterW(name: *const u16, handle: *mut Handle, defaults: *const c_void) -> i32;
        fn ClosePrinter(handle: Handle) -> i32;
        fn StartDocPrinterW(handle: Handle, level: u32, info: *const DocInfo1W) -> u32;
        fn EndDocPrinter(handle: Handle) -> i32;
        fn StartPagePrinter(handle: Handle) -> i32;
        fn EndPagePrinter(handle: Handle) -> i32;
        fn WritePrinter(handle: Handle, buf: *const c_void, len: u32, written: *mut u32) -> i32;
        fn EnumPrintersW(
            flags: u32,
            name: *const u16,
            level: u32,
            buf: *mut u8,
            buf_len: u32,
            needed: *mut u32,
            returned: *mut u32,
        ) -> i32;
        fn GetDefaultPrinterW(buf: *mut u16, len: *mut u32) -> i32;
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(once(0)).collect()
    }

    unsafe fn from_wide(p: *const u16) -> String {
        if p.is_null() {
            return String::new();
        }
        let mut len = 0;
        while *p.add(len) != 0 {
            len += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(p, len))
    }

    fn os_error(what: &str) -> String {
        format!("{what} failed: {}", std::io::Error::last_os_error())
    }

    pub fn list() -> Result<Vec<String>, String> {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let mut needed = 0u32;
        let mut count = 0u32;

        unsafe {
            // First call only asks how big the buffer must be.
            EnumPrintersW(flags, null(), 4, null_mut(), 0, &mut needed, &mut count);
            if needed == 0 {
                return Ok(Vec::new());
            }

            // u64 storage keeps the PRINTER_INFO_4W structs pointer-aligned.
            let mut buf = vec![0u64; (needed as usize).div_ceil(8)];
            if EnumPrintersW(flags, null(), 4, buf.as_mut_ptr() as *mut u8, needed, &mut needed, &mut count) == 0 {
                return Err(os_error("Listing printers"));
            }

            let infos = std::slice::from_raw_parts(buf.as_ptr() as *const PrinterInfo4W, count as usize);
            let mut names: Vec<String> = infos.iter().map(|info| from_wide(info.printer_name)).collect();
            names.sort_by_key(|n| n.to_lowercase());
            Ok(names)
        }
    }

    pub fn default() -> Option<String> {
        unsafe {
            let mut len = 0u32;
            GetDefaultPrinterW(null_mut(), &mut len);
            if len == 0 {
                return None;
            }
            let mut buf = vec![0u16; len as usize];
            if GetDefaultPrinterW(buf.as_mut_ptr(), &mut len) == 0 {
                return None;
            }
            Some(from_wide(buf.as_ptr()))
        }
    }

    pub fn print(printer: &str, data: &[u8]) -> Result<(), String> {
        let name = wide(printer);
        let doc_name = wide("FinstackPOS receipt");
        let datatype = wide("RAW");
        let mut handle: Handle = null_mut();

        unsafe {
            if OpenPrinterW(name.as_ptr(), &mut handle, null()) == 0 {
                return Err(os_error(&format!("Opening printer \"{printer}\"")));
            }

            let info = DocInfo1W {
                doc_name: doc_name.as_ptr(),
                output_file: null(),
                datatype: datatype.as_ptr(),
            };

            let result = if StartDocPrinterW(handle, 1, &info) == 0 {
                Err(os_error("Starting the print job"))
            } else {
                let page = if StartPagePrinter(handle) == 0 {
                    Err(os_error("Starting the page"))
                } else {
                    let mut written = 0u32;
                    let ok = WritePrinter(handle, data.as_ptr() as *const c_void, data.len() as u32, &mut written);
                    EndPagePrinter(handle);
                    if ok == 0 {
                        Err(os_error("Sending to the printer"))
                    } else if written as usize != data.len() {
                        Err(format!("Printer took {written} of {} bytes", data.len()))
                    } else {
                        Ok(())
                    }
                };
                EndDocPrinter(handle);
                page
            };

            ClosePrinter(handle);
            result
        }
    }
}

#[cfg(not(windows))]
mod imp {
    const UNSUPPORTED: &str = "Direct printing is only available on Windows";

    pub fn list() -> Result<Vec<String>, String> {
        Err(UNSUPPORTED.into())
    }

    pub fn default() -> Option<String> {
        None
    }

    pub fn print(_printer: &str, _data: &[u8]) -> Result<(), String> {
        Err(UNSUPPORTED.into())
    }
}
