const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const P = require('pino');
const readline = require('readline');

// --- CONFIGURACIÓN ---
const GEMINI_API_KEY = 'AQ.Ab8RN6Jla5OhbyFsP0aZUgfB1N9TkfHoF8GQ6OkFDv969hNv5Q'; 
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const URL_IMAGEN_QR = 'https://raw.githubusercontent.com/lyanvisso54-cpu/bot-claude/48c727e3c0efd43070b7de42972aa84a7c2cb148/IMG-20261116-WA0004.jpg';

// NÚMERO CONFIGURADO
const NUMERO_WHATSAPP = '51984149716'; 

const SYSTEM_PROMPT = `Eres un asesor de ventas de Claude IA. Vendes activaciones de cuentas.
Tus precios son:
- Plan Pro: 40 soles/mes
- Plan Max 5x: 100 soles/mes
- Plan Max 20x: 300 soles/mes

Tu tono: Amigable, servicial y vendedor. Usa emojis.
Reglas:
1. Si el cliente saluda, preséntate y dale la lista de precios.
2. Si pregunta por un plan, explícale los beneficios.
3. Si el cliente dice que quiere comprar o pregunta cómo pagar, dile que aceptas Yape y Plin, y que le acabas de enviar el QR.
4. Si el cliente envía una foto o dice "ya pagué", dile que verificarás el pago y le entregarás su cuenta en breve.
5. Responde en español, máximo 3 o 4 líneas.`;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Desactivamos el QR
        logger: P({ level: 'silent' }),
        browser: ["Bot Claude", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    // Lógica para vinculación con código
    if (!sock.authState.creds.registered) {
        console.log('\n--- VINCULACIÓN POR CÓDIGO ---');
        await question('Presiona ENTER para generar tu código de 8 dígitos...');
        
        try {
            const code = await sock.requestPairingCode(NUMERO_WHATSAPP);
            console.log(`\n=========================================`);
            console.log(`TU CÓDIGO ES: ${code}`);
            console.log(`=========================================\n`);
            console.log('Ve a WhatsApp > Dispositivos vinculados > Vincular con número de teléfono.');
        } catch (error) {
            console.log('Error al generar código:', error);
        }
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('¡Bot conectado 24/7 y listo para vender!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (msg.message.imageMessage) {
            await sock.sendMessage(from, { text: "¡Recibido! 📸 Estoy verificando tu comprobante. En breve un asesor te entregará tu cuenta." });
            return;
        }

        if (!text) return;

        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: SYSTEM_PROMPT });
            const result = await model.generateContent(text);
            const response = result.response.text();

            const lowerResponse = response.toLowerCase();
            if (lowerResponse.includes("yape") || lowerResponse.includes("plin") || lowerResponse.includes("qr")) {
                await sock.sendMessage(from, { text: response });
                await sock.sendMessage(from, { 
                    image: { url: URL_IMAGEN_QR }, 
                    caption: "Aquí tienes el QR para pagar por Yape o Plin ✅" 
                });
            } else {
                await sock.sendMessage(from, { text: response });
            }

        } catch (error) {
            console.error("Error con Gemini:", error);
        }
    });
}

startBot();
