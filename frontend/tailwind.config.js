/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                cgr: {
                    navy: '#0B305B',     // Azul Institucional Profundo (Autoridad)
                    blue: '#1A5F9A',     // Azul secundario (Botones, links)
                    light: '#F8FAFC',    // Fondo principal ultra claro
                    white: '#FFFFFF',
                    red: '#C0392B',      // Rojo acento (Alertas, elementos oficiales)
                    gold: '#C5A059',     // Oro sutil para detalles "Premium"
                }
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                serif: ['Lora', 'Merriweather', 'serif'], // Lora para elegancia jurídica
                mono: ['JetBrains Mono', 'monospace'],
            },
            boxShadow: {
                'premium': '0 4px 20px -2px rgba(11, 48, 91, 0.08)',
                'glass-light': '0 8px 32px 0 rgba(31, 38, 135, 0.07)'
            },
            backgroundImage: {
                'official-pattern': 'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%230b305b\' fill-opacity=\'0.03\' fill-rule=\'evenodd\'%3E%3Ccircle cx=\'3\' cy=\'3\' r=\'3\'/%3E%3Ccircle cx=\'13\' cy=\'13\' r=\'3\'/%3E%3C/g%3E%3C/svg%3E")',
            }
        },
    },
    plugins: [],
}
