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
        linear: true
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
