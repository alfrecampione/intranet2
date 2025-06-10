document.addEventListener('DOMContentLoaded', function () {
    // --- PART 1: W-9 Conditional Fields Logic ---
    const taxClassificationSelect = document.getElementById('taxClassification');
    const conditionalFields = {
        tinType: document.getElementById('tinTypeField'),
        ein: document.getElementById('einField'),
        llcClass: document.getElementById('llcClassField'),
        otherClass: document.getElementById('otherClassField'),
    };

    taxClassificationSelect.addEventListener('change', function () {
        const selectedValue = this.value;

        // Reset: hide all conditional fields and remove 'required' from their inputs
        for (const key in conditionalFields) {
            const fieldDiv = conditionalFields[key];
            fieldDiv.style.display = 'none';
            fieldDiv.querySelectorAll('input, select').forEach(input => input.required = false);
        }

        // Apply logic based on selection
        if (selectedValue === 'individual') {
            conditionalFields.tinType.style.display = 'block';
            conditionalFields.tinType.querySelector('input').required = true;
        } else if (selectedValue === 'c_corporation') {
            conditionalFields.ein.style.display = 'block';
            conditionalFields.ein.querySelector('input').required = true;
        } else if (selectedValue === 'llc_multiple_members') {
            conditionalFields.ein.style.display = 'block';
            conditionalFields.llcClass.style.display = 'block';
            conditionalFields.ein.querySelector('input').required = true;
            // LLC Classification is not strictly required by W-9, but we can make it so
            // conditionalFields.llcClass.querySelector('input').required = true;
        } else if (selectedValue === 'other') {
            conditionalFields.ein.style.display = 'block';
            conditionalFields.llcClass.style.display = 'block';
            conditionalFields.otherClass.style.display = 'block';
            conditionalFields.ein.querySelector('input').required = true;
            conditionalFields.otherClass.querySelector('input').required = true;
        }
    });

    // --- PART 2: Dynamic Bank Account List Logic ---
    const addAccountBtn = document.getElementById('addBankAccountBtn');
    const accountsContainer = document.getElementById('bankAccountsContainer');
    const accountTemplate = document.getElementById('bankAccountTemplate');
    let accountIndex = 0;

    addAccountBtn.addEventListener('click', function () {
        const newAccount = accountTemplate.cloneNode(true);
        accountIndex++;

        // Make it visible and remove the ID to avoid duplicates
        newAccount.style.display = 'block';
        newAccount.id = `bankAccount${accountIndex}`;

        // Update names and IDs to be unique for this new account
        newAccount.querySelectorAll('input, select').forEach(input => {
            const originalName = input.name;
            const originalId = input.id;

            // Set unique name for form submission (e.g., bankAccounts[1][accountNumber])
            input.name = `bankAccounts[${accountIndex}][${originalName}]`;

            // Set unique IDs for labels
            if (originalId) {
                input.id = `${originalId}${accountIndex}`;
                // Find label and update 'for'
                const label = newAccount.querySelector(`label[for="${originalId}"]`);
                if (label) {
                    label.htmlFor = input.id;
                }
            }

            // Make fields required
            if (input.name.includes('Nickname') || input.name.includes('Number')) {
                input.required = true;
            }
        });

        // Unique name for radio buttons
        const radioName = `bankAccountType_${accountIndex}`;
        newAccount.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.name = radioName;
        });

        accountsContainer.appendChild(newAccount);
    });

    // Event Delegation for removing an account
    accountsContainer.addEventListener('click', function (e) {
        if (e.target && e.target.closest('.remove-account-btn')) {
            const accountToRemove = e.target.closest('.bank-account-entry');
            accountToRemove.remove();
        }
    });
});