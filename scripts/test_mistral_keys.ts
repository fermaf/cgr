const keys = [
  { name: 'Olga', key: 'wnOLThgUXWULq2zNf2mmo312Vij729VJ' },
  { name: 'Eva', key: 'SfVwbGeIEHFriKnl8XnLzIsG9Fz6zhg6' },
  { name: 'fermaf', key: 'TrIf177kjpeXftpM3ZRmyWTCtzts1Iag' },
  { name: 'Mario', key: 'lCeLlwrVJZywALuBQ7Iz0kvwVjSBdqNa' },
  { name: 'Ale', key: 'fSJu69od2KooatbZbVeUpa54yck3cZ1u' },
  { name: 'Paola', key: 'fC8Die4wGV2OtITrr1eENSv4OWLVvLxH' }
];

async function testKeys() {
  console.log('--- Probando Claves Mistral (mistral-large-2411) ---\n');
  
  for (const item of keys) {
    process.stdout.write(`Probando ${item.name}... `);
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${item.key}`
        },
        body: JSON.stringify({
          model: 'mistral-large-2411',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5
        })
      });

      if (response.ok) {
        console.log('✅ ACCESO OK');
      } else {
        const error = await response.text();
        if (response.status === 429) {
          console.log('❌ SIN CUOTA (429)');
        } else if (response.status === 401) {
          console.log('❌ NO AUTORIZADA (401)');
        } else {
          console.log(`❌ ERROR ${response.status}: ${error.slice(0, 50)}`);
        }
      }
    } catch (e: any) {
      console.log(`❌ ERROR DE CONEXIÓN: ${e.message}`);
    }
  }
}

testKeys();
