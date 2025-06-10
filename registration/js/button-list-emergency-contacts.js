document.addEventListener('DOMContentLoaded', function () {
    const addContactBtn = document.getElementById('addContactBtn');
    const contactsContainer = document.getElementById('emergencyContactsContainer');
    const template = document.querySelector('.emergency-contact-template');

    // Función para actualizar los números y los atributos de los contactos
    function updateContactAttributes() {
        const allEntries = contactsContainer.querySelectorAll('.emergency-contact-entry:not(.emergency-contact-template)');
        allEntries.forEach((entry, index) => {
            // Actualizar el título
            entry.querySelector('h5').textContent = `Contact #${index + 1}`;

            // Actualizar IDs, names y labels
            const fullNameInput = entry.querySelector('input[name*="[fullName]"]');
            const phoneInput = entry.querySelector('input[name*="[phone]"]');
            const secondaryPhoneInput = entry.querySelector('input[name*="[secondaryPhone]"]');

            fullNameInput.id = `emergencyFullName${index}`;
            fullNameInput.name = `emergencyContacts[${index}][fullName]`;
            fullNameInput.previousElementSibling.setAttribute('for', fullNameInput.id);

            phoneInput.id = `emergencyPhone${index}`;
            phoneInput.name = `emergencyContacts[${index}][phone]`;
            phoneInput.previousElementSibling.setAttribute('for', phoneInput.id);

            secondaryPhoneInput.id = `emergencySecondaryPhone${index}`;
            secondaryPhoneInput.name = `emergencyContacts[${index}][secondaryPhone]`;
            secondaryPhoneInput.previousElementSibling.setAttribute('for', secondaryPhoneInput.id);
        });
    }

    // Evento para añadir un nuevo formulario de contacto
    addContactBtn.addEventListener('click', function () {
        const newContactEntry = template.cloneNode(true);

        // Hacer visible el nuevo formulario y quitar la clase de plantilla
        newContactEntry.style.display = '';
        newContactEntry.classList.remove('emergency-contact-template');

        // --- IMPORTANTE: Añadir 'required' a los inputs del nuevo clon ---
        newContactEntry.querySelector('input[name*="[fullName]"]').required = true;
        newContactEntry.querySelector('input[name*="[phone]"]').required = true;
        newContactEntry.querySelector('input[name*="[secondaryPhone]"]').required = true;

        // Añadir el nuevo formulario al contenedor
        contactsContainer.appendChild(newContactEntry);

        // Actualizar números y atributos de todos los contactos
        updateContactAttributes();
    });

    // Evento para eliminar un formulario de contacto (usando delegación de eventos)
    contactsContainer.addEventListener('click', function (e) {
        const removeBtn = e.target.closest('.remove-contact-btn');
        if (removeBtn) {
            const entryToRemove = removeBtn.closest('.emergency-contact-entry');
            entryToRemove.remove();

            // Volver a numerar y actualizar los atributos de los contactos restantes
            updateContactAttributes();
        }
    });
});
