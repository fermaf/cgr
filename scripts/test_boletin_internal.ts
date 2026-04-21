import { generateBoletinContent } from '../cgr-platform/src/lib/boletinEngine';
import { generateImagePrompt } from '../cgr-platform/src/lib/agents/geminiConsultant';
import { generateAudio } from '../cgr-platform/src/lib/agents/elevenLabsSpeaker';
import type { Env } from '../cgr-platform/src/types';

// Mock Environment
const env: Env = {
    DB: {} as any,
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || '',
    MISTRAL_API_URL: 'https://api.mistral.ai/v1',
    MISTRAL_MODEL: 'mistral-large-2411',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',
    ELEVENLABS_TOOL_SECRET: 'elevenlabs.ioQazqaz1',
    LOG_LEVEL: 'debug'
} as any;

async function runGlobalTest() {
    console.log('🚀 Iniciando Prueba Global Interna - Motor de Boletines (v2)\n');

    // 1. Mock Data
    const mockInputs = [
        {
            dictamen_id: 'E523936N24',
            titulo: 'Dictamen de Ley Karin',
            resumen: 'Instrucciones sobre acoso laboral y sexual en el sector público.',
            analisis: 'Análisis profundo sobre la prevención y sanción del acoso laboral tras las modificaciones al Código del Trabajo...',
            materia: 'Derecho Laboral Administrativo'
        },
        {
            dictamen_id: 'E516610N24',
            titulo: 'Violencia en el Trabajo',
            resumen: 'Prevención y sanción de violencia en el trabajo según nuevos estatutos.',
            analisis: 'Implementación de protocolos de seguridad y canales de denuncia institucionales...',
            materia: 'Estatuto Administrativo'
        }
    ];

    console.log(`[TEST] 1. Datos cargados: ${mockInputs.length} dictámenes.\n`);

    // 2. Probar BoletinEngine (Mistral Map-Reduce)
    console.log('[TEST] 2. Ejecutando Generación de Contenido (Mistral)...');
    try {
        const result = await generateBoletinContent(env, mockInputs);
        if (result) {
            console.log('✅ Contenido Generado con Éxito:');
            console.log('---');
            console.log('Documento Central (recorte):', result.documento_central.slice(0, 100) + '...');
            console.log('Newsletter:', result.newsletter_email.slice(0, 50) + '...');
            console.log('X Thread Tweets:', result.redes_sociales.twitter_thread.length);
            console.log('---\n');

            // 3. Probar Gemini Consultant (Visual Prompts)
            console.log('[TEST] 3. Generando Prompt de Imagen (Gemini)...');
            const visualPrompt = await generateImagePrompt(env, result.documento_central, 'LINKEDIN');
            console.log('✅ Prompt de Gemini:', visualPrompt, '\n');

            // 4. Probar ElevenLabs (Audio)
            if (env.ELEVENLABS_API_KEY) {
                console.log('[TEST] 4. Generando Audio (ElevenLabs)...');
                const audio = await generateAudio(env, "Bienvenidos a un nuevo boletín de Indubia");
                console.log(audio ? '✅ Audio generado correctamente.' : '❌ Error en generación de audio.');
            } else {
                console.log('[TEST] 4. ElevenLabs saltado (No hay API KEY).\n');
            }
        } else {
            console.log('❌ Falló la generación de contenido (null).');
        }

    } catch (e) {
        console.error('❌ Error catastrófico en la prueba:', e);
    }

    console.log('\n--- FIN DE LA PRUEBA ---');
}

runGlobalTest();
