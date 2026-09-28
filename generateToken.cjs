const jwt = require('jsonwebtoken');
const fs = require('fs');

// --- CONFIGURATION ---
// Your App ID from the console
const appId = "69146b29470d4af1b777f9276cfe85eb"; 

/** * ACTION REQUIRED: 
 * 1. Find the 'ID' in your API Keys table.
 * 2. It looks like: vpaas-magic-cookie-69146b29470d4af1b777f9276cfe85eb/XXXXXX
 */
const kid = "vpaas-magic-cookie-69146b29470d4af1b777f9276cfe85eb/15a968"; 

// 3. Match this filename to your downloaded .pk file exactly
const privateKeyPath = process.env.JAAS_PRIVATE_KEY_PATH || 'Key 24_02_2026, 17_45_23.pk'; // keep the key file outside git

const htmlFilePath = './index.html'; 

// --- GENERATION LOGIC ---
try {
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const now = Math.floor(Date.now() / 1000);

    const payload = {
        iss: "chat",
        aud: "jitsi",
        exp: now + 3600, // Token valid for 1 hour
        nbf: now,
        iat: now,
        sub: appId,
        context: {
            user: { name: "Tutor_Scott", moderator: true },
            features: { recording: true, livestreaming: true, transcription: true }
        },
        room: "*"
    };

    const token = jwt.sign(payload, privateKey, { 
        algorithm: 'RS256', 
        header: { kid, typ: "JWT" } 
    });

    console.log("✅ New Token Generated.");

    // --- AUTO-UPDATE INDEX.HTML ---
    let htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
    
    // This looks for 'const JWT_TOKEN = "...";' and replaces the middle part
    const updatedHtml = htmlContent.replace(
        /const JWT_TOKEN = ".*?";/, 
        `const JWT_TOKEN = "${token}";`
    );

    fs.writeFileSync(htmlFilePath, updatedHtml, 'utf8');
    console.log("✅ index.html has been updated with the new token.");

} catch (err) {
    console.error("❌ Error:", err.message);
}