document.addEventListener('DOMContentLoaded', function () {
    // ... (Tu código existente para W-9 y Cuentas Bancarias va aquí arriba) ...


    // --- PART 3: Signature Pad Logic ---
    const canvas = document.getElementById('signature-canvas');
    const clearButton = document.getElementById('clear-signature-btn');

    // Ajustar el tamaño del canvas a su contenedor
    // Esto es crucial para que funcione en diferentes tamaños de pantalla
    function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d").scale(ratio, ratio);
    }

    // Inicializar el SignaturePad
    // Se ejecuta solo si el canvas existe en la página
    if (canvas) {
        window.addEventListener("resize", resizeCanvas);
        resizeCanvas();

        const signaturePad = new SignaturePad(canvas, {
            backgroundColor: 'rgb(255, 255, 255)', // Fondo blanco
            penColor: 'rgb(0, 0, 0)' // Lápiz negro
        });

        // Funcionalidad del botón de limpiar
        clearButton.addEventListener('click', function () {
            signaturePad.clear();
        });
    }

});