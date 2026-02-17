import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const CONFIG = {
    SOURCE_FILE: '/home/fermaf/github/cgr/mongoBackup/20250630_dictamenes_source_84973.txt',
    PASO_FILE: '/home/fermaf/github/cgr/mongoBackup/20250630_dictamenes_paso_10047.txt',
    SAMPLES_DIR: '/home/fermaf/github/cgr/migracion3/samples',
    LIMIT: 33
};

async function extractSample(filePath: string, outputName: string) {
    console.log(`Extracting ${CONFIG.LIMIT} records from ${path.basename(filePath)}...`);

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let records: string[] = [];
    let buffer = '';
    let inRecord = false;
    let count = 0;

    for await (const line of rl) {
        if (line.startsWith('  {') && !inRecord) {
            inRecord = true;
            buffer = line + '\n';
            continue;
        }

        if (inRecord) {
            buffer += line + '\n';
            if (line.startsWith('  },') || line.startsWith('  }')) {
                records.push(buffer.trim().replace(/,$/, ''));
                count++;
                buffer = '';
                inRecord = false;

                if (count >= CONFIG.LIMIT) break;
            }
        }
    }

    const outputPath = path.join(CONFIG.SAMPLES_DIR, outputName);
    fs.writeFileSync(outputPath, '[\n' + records.join(',\n') + '\n]');
    console.log(`Saved ${count} records to ${outputPath}`);
}

async function run() {
    if (!fs.existsSync(CONFIG.SAMPLES_DIR)) {
        fs.mkdirSync(CONFIG.SAMPLES_DIR, { recursive: true });
    }

    await extractSample(CONFIG.SOURCE_FILE, 'sample_source_33.json');
    await extractSample(CONFIG.PASO_FILE, 'sample_paso_33.json');
}

run().catch(console.error);
