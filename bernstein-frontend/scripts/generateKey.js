import fs from 'fs';

const SALT_A = 0x4B3A2;
const SALT_B = 0x1F9D4;

const textToHash = (text) => {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        // hash * 33 + c
        hash = ((hash << 5) + hash) + text.charCodeAt(i);
    }
    return hash >>> 0; // Ensure unsigned 32-bit integer
};

const generateKey = (projectId) => {
    if (!projectId) {
        console.error('Please provide a projectId');
        console.log('Usage: node generateKey.js <projectId>');
        process.exit(1);
    }

    const payload = btoa(projectId);
    const h1 = textToHash(projectId);
    const checkA = (h1 ^ SALT_A) >>> 0;
    const checkB = (checkA * 33) ^ SALT_B;

    // CheckB is a number, we need hex string
    const signature = checkB.toString(16);

    const key = `pro_v1_${payload}_${signature}`;

    console.log(`\nGenerating License Key for Project ID: "${projectId}"`);
    console.log('--------------------------------------------------');
    console.log(`Key: ${key}`);
    console.log('--------------------------------------------------');

    fs.writeFileSync('license_key.txt', key);
};

const projectId = process.argv[2];
generateKey(projectId);
