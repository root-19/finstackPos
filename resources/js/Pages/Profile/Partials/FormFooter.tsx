import { Icon } from '@/Components/NavIcons';
import PrimaryButton from '@/Components/PrimaryButton';
import { Transition } from '@headlessui/react';

/** Save row at the bottom of a profile card, with a brief "Saved" note after success. */
export default function FormFooter({ processing, saved }: { processing: boolean; saved: boolean }) {
    return (
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-4 py-3 sm:px-5">
            <Transition show={saved} enter="transition ease-in-out" enterFrom="opacity-0" leave="transition ease-in-out" leaveTo="opacity-0">
                <p className="flex items-center gap-1.5 text-sm text-emerald-700" role="status">
                    <Icon name="check" />
                    Saved
                </p>
            </Transition>
            <PrimaryButton disabled={processing}>Save</PrimaryButton>
        </div>
    );
}
