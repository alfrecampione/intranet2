function showToast(headerText, bodyText) {
    const toast = document.querySelector('.toast-ex1');
    toast.querySelector('.toast-header small').textContent = headerText;
    toast.querySelector('.toast-body').textContent = bodyText;
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

document.addEventListener('DOMContentLoaded', function () {
    // --- STEPPER INITIALIZATION ---
    const stepperElement = document.getElementById('multiStepsValidation');
    if (!stepperElement) return;

    const stepper = new Stepper(stepperElement, {
        linear: false
    });

    // --- FUNCTION TO VALIDATE A COMPLETE STEP ---
    const validateStep = (stepContent) => {
        const requiredElements = stepContent.querySelectorAll(
            "[required]:not([type='hidden'])"
        );
        let valid = true;
        let message = "";

        // Group radios by name
        const radioGroups = {};

        requiredElements.forEach((field) => {
            const style = window.getComputedStyle(field);
            if (
                style.display === "none" ||
                style.visibility === "hidden" ||
                field.offsetParent === null
            ) return;

            const type = field.type;

            // Group radios
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

        // Validate radio groups
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

        // Specific validation: account number
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

    stepperHeader.addEventListener('click', async function (e) {
        const trigger = e.target.closest('.step-trigger');
        if (!trigger) return;

        const stepElement = trigger.closest('.step');
        const allSteps = Array.from(stepperHeader.querySelectorAll('.step'));
        const stepIndex = allSteps.indexOf(stepElement);

        if (stepIndex === -1) return;

        const currentStepIndex = stepper._currentIndex;
        const stepContents = stepperElement.querySelectorAll('.bs-stepper-content > .content');
        const currentStepContent = stepContents[currentStepIndex];

        // If attempting to go backwards, allow without validating
        if (stepIndex < currentStepIndex) {
            stepper.to(stepIndex + 1);
            return;
        }

        const [valid, message] = validateStep(currentStepContent);

        if (!valid) {
            stepper.to(currentStepIndex + 1);
            showToast("Error", message);
            return;
        }

        // Save current step before advancing
        const stepId = currentStepContent.id;
        console.log('🔍 [DEBUG] Current step ID:', stepId);
        console.log('🔍 [DEBUG] savePersonalInfo exists?', typeof savePersonalInfo !== 'undefined');
        console.log('🔍 [DEBUG] savePaymentMethod exists?', typeof savePaymentMethod !== 'undefined');
        let saveSuccess = false;

        try {
            switch (stepId) {
                case 'accountDetailsValidation':
                    console.log('✅ Calling savePersonalInfo...');
                    await savePersonalInfo();
                    console.log('✅ savePersonalInfo completed');
                    saveSuccess = true;
                    break;
                case 'contactInfoValidation':
                    console.log('✅ Calling saveContactInfo...');
                    await saveContactInfo();
                    console.log('✅ saveContactInfo completed');
                    saveSuccess = true;
                    break;
                case 'commisionValidation':
                    console.log('✅ Calling savePaymentMethod...');
                    await savePaymentMethod();
                    console.log('✅ savePaymentMethod completed');
                    saveSuccess = true;
                    break;
                case 'documentsValidation':
                    console.log('✅ Calling saveDocuments...');
                    await saveDocuments();
                    console.log('✅ saveDocuments completed');
                    saveSuccess = true;
                    break;
                default:
                    console.log('⚠️ No matching case for stepId:', stepId);
                    saveSuccess = true;
            }

            if (saveSuccess) {
                stepper.to(stepIndex + 1);
            }
        } catch (error) {
            console.error('Error saving step:', error);
            const errorMessage = error.message || "Failed to save information. Please try again.";
            showToast("Error", errorMessage);
            stepper.to(currentStepIndex + 1);
        }
    });

    // --- "NEXT" BUTTONS LOGIC ---
    const btnNextList = document.querySelectorAll('.btn-next');
    btnNextList.forEach(btn => {
        btn.addEventListener('click', async () => {
            const currentStep = stepperElement.querySelector('.content.active');
            const [isValid, message] = validateStep(currentStep);

            if (!isValid) {
                showToast("Error", message);
                return;
            }

            // Identify which step we are validating
            const stepId = currentStep.id;
            console.log('🔍 [NEXT BTN] Current step ID:', stepId);
            let saveSuccess = false;

            try {
                // Disable button while processing
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

                switch (stepId) {
                    case 'accountDetailsValidation':
                        console.log('✅ [NEXT BTN] Calling savePersonalInfo...');
                        await savePersonalInfo();
                        console.log('✅ [NEXT BTN] savePersonalInfo completed');
                        saveSuccess = true;
                        break;
                    case 'contactInfoValidation':
                        console.log('✅ [NEXT BTN] Calling saveContactInfo...');
                        await saveContactInfo();
                        console.log('✅ [NEXT BTN] saveContactInfo completed');
                        saveSuccess = true;
                        break;
                    case 'commisionValidation':
                        console.log('✅ [NEXT BTN] Calling savePaymentMethod...');
                        await savePaymentMethod();
                        console.log('✅ [NEXT BTN] savePaymentMethod completed');
                        saveSuccess = true;
                        break;
                    case 'documentsValidation':
                        console.log('✅ [NEXT BTN] Calling saveDocuments...');
                        await saveDocuments();
                        console.log('✅ [NEXT BTN] saveDocuments completed');
                        saveSuccess = true;
                        break;
                    default:
                        console.log('⚠️ [NEXT BTN] No matching case for stepId:', stepId);
                        saveSuccess = true; // Allow advancing if no save function exists
                }

                if (saveSuccess) {
                    stepper.next();
                }
            } catch (error) {
                console.error('Error saving step:', error);
                const errorMessage = error.message || "Failed to save information. Please try again.";
                showToast("Error", errorMessage);
            } finally {
                // Restore button
                btn.disabled = false;
                btn.innerHTML = 'Next <i class="ti ti-arrow-right ti-xs"></i>';
            }
        });
    });

    // --- "PREVIOUS" BUTTONS LOGIC ---
    const btnPrevList = document.querySelectorAll('.btn-prev');
    btnPrevList.forEach(btn => {
        btn.addEventListener('click', () => {
            stepper.previous();
        });
    });
});
