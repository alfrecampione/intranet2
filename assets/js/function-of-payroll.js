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

    // Iniciar con la cantidad de cuentas actuales (basado en el DOM)
    let accountIndex = document.querySelectorAll('#bankAccountsContainer .bank-account-entry').length;

    addAccountBtn.addEventListener('click', function () {
      const newAccount = accountTemplate.cloneNode(true);
      accountIndex++;
    
      newAccount.style.display = 'block';
      newAccount.id = `bankAccount${accountIndex}`;
    
      // Asignar nombres únicos y compatibles con paymentMethods[i][...]
      newAccount.querySelectorAll('input, select').forEach(input => {
        const originalName = input.name;
        const originalId = input.id;
        
        // Cambiar el name del input a paymentMethods[i][fieldName]
        input.name = `paymentMethods[${accountIndex}][${originalName}]`;
        
        // Si el input tiene ID, lo actualizamos y su label correspondiente también
        if (originalId) {
          const newId = `${originalId}${accountIndex}`;
          input.id = newId;
        
          const label = newAccount.querySelector(`label[for="${originalId}"]`);
          if (label) {
            label.setAttribute("for", newId);
          }
        }
      
        // Añadir required si es un campo sensible
        if (input.name.includes('accountNickname') || input.name.includes('accountNumber') || input.name.includes('routingNumber')) {
          input.required = true;
        }
      });

    // Radio buttons: Asignar el mismo name con paymentMethods[i][bankAccountType]
    const radioName = `paymentMethods[${accountIndex}][bankAccountType]`;
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