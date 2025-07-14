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
            if (
                style.display === "none" ||
                style.visibility === "hidden" ||
                field.offsetParent === null
            ) return;

            field.classList.remove("is-invalid");
            if (!field.value || (field.type === "checkbox" && !field.checked)) {
                field.classList.add("is-invalid");
                valid = false;
            }
        });
        if (!valid) {
            message = "Please fill out all required fields.";
        }

        const requiredFileInputs = stepContent.querySelectorAll('input[type="file"][required]');
        requiredFileInputs.forEach(input => {
            const label = stepContent.querySelector(`label[for="${input.id}"]`);
            const parent = input.closest('.d-flex');
            const hasExistingFile = parent && parent.querySelector('a[href].ms-2');

            if (
                label &&
                label.offsetParent !== null &&
                (!input.files || input.files.length === 0) &&
                !hasExistingFile
            ) {
                label.classList.add("is-invalid");
                valid = false;
                message = "Please upload all required documents.";
            } else if (label) {
                label.classList.remove("is-invalid");
            }
        });

        const accountNumber = stepContent.querySelector('input[name="accountNumber"]');
        const confirmAccountNumber = stepContent.querySelector('input[name="confirmAccountNumber"]');

        if (
            accountNumber && confirmAccountNumber &&
            accountNumber.offsetParent !== null && confirmAccountNumber.offsetParent !== null
        ) {
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

        const directHireRadios = Array.from(stepContent.querySelectorAll('input[name="isDirectlyHired"]'))
            .filter(radio => radio.offsetParent !== null);
        const anyChecked = directHireRadios.some(radio => radio.checked);
        if (directHireRadios.length > 0 && !anyChecked) {
            directHireRadios.forEach(radio => radio.classList.add("is-invalid"));
            valid = false;
            message = "Please fill out all required fields.";
        } else {
            directHireRadios.forEach(radio => radio.classList.remove("is-invalid"));
        }

        const contactType = stepContent.querySelector("#contactType");
        if (contactType && contactType.offsetParent !== null && contactType.value === "business") {
            const businessName = stepContent.querySelector("#businessName");
            const ein = stepContent.querySelector("#ein");

            if (businessName && businessName.offsetParent !== null && !businessName.value) {
                businessName.classList.add("is-invalid");
                valid = false;
            }
            if (ein && ein.offsetParent !== null && !ein.value) {
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
