document.addEventListener('DOMContentLoaded', function () {
    // --- INICIALIZACIÓN DEL STEPPER ---
    const stepperElement = document.getElementById('multiStepsValidation');
    if (!stepperElement) return; // Salir si el stepper no existe

    const stepper = new Stepper(stepperElement, {
        linear: true // Recomendado: obliga al usuario a seguir los pasos en orden.
    });

    const multiStepsForm = document.getElementById('multiStepsForm');

    // --- FUNCIÓN PARA VALIDAR UN CAMPO INDIVIDUAL Y MOSTRAR FEEDBACK ---
    const validateInput = (input) => {
        let isValid = true;
        let errorMessage = '';
        const feedbackElement = input.nextElementSibling;

        // Limpiar estados previos
        input.classList.remove('is-invalid', 'is-valid');
        if (feedbackElement) feedbackElement.textContent = '';
        input.setCustomValidity(''); // Limpiar cualquier mensaje de validez personalizado previo

        // --- Manejo especial para grupos de radio ---
        if (input.type === 'radio') {
            const radioGroupName = input.name;
            // Selecciona todos los radios con el mismo nombre y que sean requeridos
            const radioGroup = document.querySelectorAll(`input[name="${radioGroupName}"][required]`);
            const isAnyRadioChecked = Array.from(radioGroup).some(radio => radio.checked);

            if (!isAnyRadioChecked) {
                isValid = false;
                errorMessage = `Por favor, seleccione una opción para ${radioGroupName.replace(/([A-Z])/g, ' $1').trim()}.`; // Hace el nombre más legible
                radioGroup.forEach(radio => radio.classList.add('is-invalid')); // Marca todos los radios del grupo como inválidos
                // Establece el mensaje de error en el primer elemento de feedback del grupo
                if (feedbackElement) feedbackElement.textContent = errorMessage;
                // setCustomValidity en uno de ellos para que el navegador lo marque si hay submit de formulario
                input.setCustomValidity(errorMessage);
            } else {
                radioGroup.forEach(radio => radio.classList.remove('is-invalid')); // Limpia si ya hay una selección
                input.setCustomValidity(''); // Limpia custom validity
            }
        } else {
            if (input.checkValidity()) {
                input.classList.add('is-valid');
            } else {
                isValid = false;
                input.classList.add('is-invalid');

                // Determinar el mensaje de error basado en el tipo de validación fallida
                if (input.validity.valueMissing) {
                    errorMessage = 'Este campo es requerido.';
                } else if (input.validity.typeMismatch) {
                    errorMessage = `Por favor, ingrese un ${input.type} válido.`;
                } else if (input.validity.patternMismatch) {
                    errorMessage = input.title || 'El formato no es válido.';
                } else if (input.validity.tooShort) {
                    errorMessage = `Requiere al menos ${input.minLength} caracteres. Actualmente tiene ${input.value.length}.`;
                } else if (input.validity.tooLong) {
                    errorMessage = `Máximo ${input.maxLength} caracteres. Actualmente tiene ${input.value.length}.`;
                } else if (input.validity.rangeUnderflow) {
                    errorMessage = `El valor debe ser igual o mayor a ${input.min}.`;
                } else if (input.validity.rangeOverflow) {
                    errorMessage = `El valor debe ser igual o menor a ${input.max}.`;
                } else {
                    errorMessage = 'El campo no es válido.';
                }


                if (feedbackElement) feedbackElement.textContent = errorMessage;
                input.setCustomValidity(errorMessage);
            }
        }
        return isValid;
    };
    // --- FUNCIÓN PARA VALIDAR UN PASO COMPLETO ---
    const validateStep = (stepElement) => {
        let allFieldsValid = true;

        const requiredInputsInStep = stepElement.querySelectorAll('input[required]:not([type="radio"]), select[required], textarea[required]');

        requiredInputsInStep.forEach(input => {
            if (!validateInput(input)) {
                allFieldsValid = false;
            }
        });

        // Validar grupos de radio por separado para no repetir la validación
        const radioGroups = {};
        stepElement.querySelectorAll('input[type="radio"][required]').forEach(radio => {
            radioGroups[radio.name] = radio; // Guardamos solo un radio por grupo
        });

        for (const radioName in radioGroups) {
            if (!validateInput(radioGroups[radioName])) {
                allFieldsValid = false;
            }
        }

        return allFieldsValid;
    };

    // --- LÓGICA DE BOTONES "NEXT" ---
    const btnNextList = document.querySelectorAll('.btn-next');
    btnNextList.forEach(btn => {
        btn.addEventListener('click', () => {
            const currentStep = stepperElement.querySelector('.content.active');
            if (validateStep(currentStep)) {
                stepper.next();
            }
        });
    });

    // --- LÓGICA DE BOTONES "PREVIOUS" ---
    const btnPrevList = document.querySelectorAll('.btn-prev');
    btnPrevList.forEach(btn => {
        btn.addEventListener('click', () => {
            stepper.previous(); // No se necesita validación para ir hacia atrás
        });
    });

    // // --- LÓGICA DE ENVÍO FINAL ---
    // multiStepsForm.addEventListener('submit', function (event) {
    //     event.preventDefault();

    //     const lastStep = document.getElementById('documentsValidation'); // O el ID de tu último paso
    //     if (validateStep(lastStep)) {
    //         alert("Formulario enviado con éxito!");
    //         // Aquí iría el envío real de datos al servidor (ej. usando fetch)
    //         // multiStepsForm.submit(); // Descomentar para un envío de formulario normal
    //     } else {
    //         console.error("Envío bloqueado: el último paso contiene errores.");
    //     }
    // });



});