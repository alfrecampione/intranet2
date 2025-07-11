function showToast(headerText, bodyText) {
    const toast = document.querySelector('.toast-ex1');
    toast.querySelector('.toast-header small').textContent = headerText;
    toast.querySelector('.toast-body').textContent = bodyText;
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

document.addEventListener('DOMContentLoaded', function () {
    // --- INICIALIZACIÓN DEL STEPPER ---
    const stepperElement = document.getElementById('multiStepsValidation');
    if (!stepperElement) return;

    const stepper = new Stepper(stepperElement, {
        linear: false
    });

    // --- FUNCIÓN PARA VALIDAR UN PASO COMPLETO ---
    const validateStep = (stepContent) => {
        const requiredFields = stepContent.querySelectorAll(
            "input[required]:not([type='hidden']), select[required], textarea[required]"
        );
        let valid = true;
        let message = "";

        requiredFields.forEach(function (field) {
            const style = window.getComputedStyle(field);
            if (style.display === "none" || field.offsetParent === null) return;
            field.classList.remove("is-invalid");
            if (!field.value || (field.type === "checkbox" && !field.checked)) {
                field.classList.add("is-invalid");
                valid = false;
            }
        });
        if (!valid) {
            message = "Please fill out all required fields.";
        }

        // Validación especial para cuenta bancaria
        const accountNumber = stepContent.querySelector('input[name="accountNumber"]');
        const confirmAccountNumber = stepContent.querySelector('input[name="confirmAccountNumber"]');

        if (accountNumber && confirmAccountNumber) {
            accountNumber.classList.remove("is-invalid");
            confirmAccountNumber.classList.remove("is-invalid");

            if (!accountNumber.value.trim()) {
                accountNumber.classList.add("is-invalid");
                valid = false;
            }
            if (!confirmAccountNumber.value.trim()) {
                confirmAccountNumber.classList.add("is-invalid");
                valid = false;
            } else if (accountNumber.value !== confirmAccountNumber.value) {
                confirmAccountNumber.value = "";
                confirmAccountNumber.focus();
                confirmAccountNumber.classList.add("is-invalid");
                valid = false;
                message = "Account numbers do not match."
            }
        }

        const directHireRadios = stepContent.querySelectorAll('input[name="isDirectlyHired"]');
        const anyChecked = Array.from(directHireRadios).some(radio => radio.checked);
        if (directHireRadios.length > 0 && !anyChecked) {
            directHireRadios.forEach(radio => radio.classList.add("is-invalid"));
            valid = false;
            message = "Please fill out all required fields.";
        } else {
            directHireRadios.forEach(radio => radio.classList.remove("is-invalid"));
        }

        // Validación especial para campos de negocio
        const contactType = document.getElementById("contactType");
        if (contactType && contactType.value === "business") {
            const businessName = document.getElementById("businessName");
            const ein = document.getElementById("ein");
            if (businessName && !businessName.value.trim()) {
                businessName.classList.add("is-invalid");
                valid = false;
            }
            if (ein && !ein.value.trim()) {
                ein.classList.add("is-invalid");
                valid = false;
            }
            if (!valid) {
                message = "Business Name and EIN are required for Business type.";
            }
        }

        return [valid, message];
    };

    const stepperHeader = stepperElement.querySelector('.bs-stepper-header');

    stepperHeader.addEventListener('click', function (e) {
        const trigger = e.target.closest('.step-trigger');
        if (!trigger) return;

        const stepElement = trigger.closest('.step');
        const allSteps = Array.from(stepperHeader.querySelectorAll('.step'));
        const stepIndex = allSteps.indexOf(stepElement);

        if (stepIndex === -1) return;

        const currentStepIndex = stepper._currentIndex;
        const stepContents = stepperElement.querySelectorAll('.bs-stepper-content > .content');
        const currentStepContent = stepContents[currentStepIndex];

        const [valid, message] = validateStep(currentStepContent);

        if (!valid) {
            stepper.to(currentStepIndex)
            showToast("Error", message);
        }
        else
            stepper.to(stepIndex + 1);
    });

    // --- LÓGICA DE BOTONES "NEXT" ---
    const btnNextList = document.querySelectorAll('.btn-next');
    btnNextList.forEach(btn => {
        btn.addEventListener('click', () => {
            const currentStep = stepperElement.querySelector('.content.active');
            const [isValid, message] = validateStep(currentStep);

            if (!isValid) {
                showToast("Error", message);
            }
            else
                stepper.next();
        });
    });

    // --- LÓGICA DE BOTONES "PREVIOUS" ---
    const btnPrevList = document.querySelectorAll('.btn-prev');
    btnPrevList.forEach(btn => {
        btn.addEventListener('click', () => {
            stepper.previous();
        });
    });
});
