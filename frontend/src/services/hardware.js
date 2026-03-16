/**
 * Servicio para interactuar con el hardware local (impresora térmica).
 * Se asume que el servicio de hardware corre en http://localhost:8001
 */

// Use environment variable or fallback to localhost if not defined
const HARDWARE_URL = import.meta.env.VITE_HARDWARE_URL || 'http://localhost:8001';
const API_URL = `${HARDWARE_URL}/api`;

export const imprimirOrden = async (orderData) => {
  try {
    const response = await fetch(`${HARDWARE_URL}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Error al imprimir');
    }

    return await response.json();
  } catch (error) {
    console.warn('Hardware service not available or error:', error);
    throw error;
  }
};

export const getPrinters = async () => {
  try {
    const response = await fetch(`${HARDWARE_URL}/printers`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching printers:', error);
    return { error: 'Service not available' };
  }
};
