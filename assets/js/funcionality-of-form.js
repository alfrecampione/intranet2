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
        const requiredElements = stepContent.querySelectorAll(
            "[required]:not([type='hidden'])"
        );
        let valid = true;
        let message = "";

        // Agrupar radios por name
        const radioGroups = {};

        requiredElements.forEach((field) => {
            const style = window.getComputedStyle(field);
            if (
                style.display === "none" ||
                style.visibility === "hidden" ||
                field.offsetParent === null
            ) return;

            const type = field.type;

            // Agrupar radios
            if (type === "radio") {
                if (!radioGroups[field.name]) {
                    radioGroups[field.name] = [];
                }
                radioGroups[field.name].push(field);
                return;
            }

            field.classList.remove("is-invalid");

            if (type === "checkbox" && !field.checked) {
                field.classList.add("is-invalid");
                valid = false;
            } else if (type === "file") {
                const parent = field.closest('.d-flex');
                const hasExistingFile = parent && parent.querySelector('a[href].ms-2');
                const label = stepContent.querySelector(`label[for="${field.id}"]`);

                if (!field.files?.length && !hasExistingFile) {
                    if (label) label.classList.add("is-invalid");
                    field.classList.add("is-invalid");
                    valid = false;
                    message ||= "Please upload all required documents.";
                } else {
                    if (label) label.classList.remove("is-invalid");
                    field.classList.remove("is-invalid");
                }
            } else if (!field.value?.trim()) {
                field.classList.add("is-invalid");
                valid = false;
            }
        });

        // Validar grupos de radio
        Object.entries(radioGroups).forEach(([name, radios]) => {
            const visibleRadios = radios.filter(r => r.offsetParent !== null);
            const anyChecked = visibleRadios.some(r => r.checked);

            visibleRadios.forEach(r => r.classList.remove("is-invalid"));

            if (!anyChecked) {
                visibleRadios.forEach(r => r.classList.add("is-invalid"));
                valid = false;
                message ||= "Please fill out all required fields.";
            }
        });

        // Validación específica: account number
        const accountNumber = stepContent.querySelector('#accountNumber');
        const confirmAccountNumber = stepContent.querySelector('#confirmAccountNumber');

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
                message = "Account numbers do not match.";
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
