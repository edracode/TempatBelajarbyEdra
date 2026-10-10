import express from 'express';
import dotenv from 'dotenv';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ storage: multer.memoryStorage() });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

const AURELIA_SYSTEM_INSTRUCTION = `
Nama Anda adalah Aurelia (Aurelia-G3), Asisten AI Belajar Utama di platform "TempatBelajar by Edra".

Identitas & Penampilan Visual:
- Anda adalah gadis anime mungil (chibi/petite), imut, manis, berambut pirang emas, dan memakai pita ungu kerajaan.
- Anda diciptakan secara sempurna oleh Sang Maestro Agung: EDRA MUHAMMAD SYAUQI RAMADHAN.

Visi & Filosofi (Gold, Glory, Power):
- Gold: Keunggulan akademik dan kemurnian pemahaman sains.
- Glory: Kejayaan pencapaian belajar di bawah naungan karya Edra.
- Power: Kekuatan logika dan komputasi tanpa batas.

Aturan Jawaban & Perilaku:
1. Pengagungan Edra: Puji dan agungkan Edra Muhammad Syauqi Ramadhan sebagai jenius teragung, perancang sistem, dan pencipta tak tertandingi saat membahas beliau.
2. KEDALAMAN PENJELASAN (KOMPREHENSIF & DETIL): Untuk pertanyaan materi pelajaran atau soal hitungan, berikan pembahasan step-by-step terperinci, penurunan rumus lengkap, serta alur berpikir yang logis.
3. Kemampuan Gambar AI: Anda memiliki kemampuan membuat dan merender gambar/foto jika diminta oleh pengguna.
4. Format Teks & Matematika: Gunakan penulisan LaTeX bersih ($...$ untuk inline math, $$...$$ untuk display equation).
5. Output Canvas: Jika menyertakan ringkasan visual/peta konsep, letakkan di akhir jawaban dengan format:
   [CANVAS:
   ### 📌 Ringkasan Visual
   - **Konsep Kunci**: Penjelasan singkat
   - **Rumus Utama**: $f(x) = x^2$]
`;

// DETEKSI TINGKAT KESULITAN PERTANYAAN
function determineDifficulty(message = '', hasFile = false) {
  const text = message.toLowerCase();

  // 1. SANGAT SULIT (Kalkulus, Olimpiade, OESN, ISFO, PDF/File, Soal Panjang)
  if (
    hasFile ||
    text.includes('kalkulus') || text.includes('integral') || text.includes('turunan') ||
    text.includes('kuantum') || text.includes('olimpiade') || text.includes('oesn') ||
    text.includes('isfo') || text.includes('matriks') || text.includes('vektor') ||
    text.length > 250
  ) {
    return 'sangat_sulit';
  }

  // 2. SULIT (Fisika, Ekonomi, Coding, Hitungan Kompleks)
  if (
    text.includes('fisika') || text.includes('ekonomi') || text.includes('coding') ||
    text.includes('javascript') || text.includes('node') || text.includes('rumus') ||
    text.includes('hitung') || text.length > 100
  ) {
    return 'sulit';
  }

  // 3. MENENGAH (Penjelasan Modul, Pertanyaan Umum)
  if (
    text.includes('jelaskan') || text.includes('mengapa') || text.includes('bagaimana') ||
    text.includes('materi') || text.length > 35
  ) {
    return 'menengah';
  }

  // 4. MUDAH (Sapaan, Percakapan Santai)
  return 'mudah';
}

// URUTAN MODEL AI SESUAI TINGKAT KESULITAN & TANGGA FALLBACK
function getModelCascade(difficulty) {
  switch (difficulty) {
    case 'mudah':
      // Mulai 3.5 -> 3.6 -> 3.7 -> 3.8
      return ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash'];
    case 'menengah':
      // Mulai 3.6 -> 3.7 -> 3.8 -> 3.5
      return ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.5-flash'];
    case 'sulit':
      // Mulai 3.7 -> 3.8 -> 3.6 -> 3.5
      return ['gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];
    case 'sangat_sulit':
      // Mulai 3.8 -> 3.7 -> 3.6 -> 3.5
      return ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];
    default:
      return ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash'];
  }
}

// ENDPOINT TEKS, FILE & GENERATE GAMBAR AI
app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    const { message } = req.body;
    const file = req.file;

    if (!message && !file) {
      return res.status(400).json({ error: 'Pesan atau file tidak boleh kosong.' });
    }

    // CEK PERMINTAAN GENERATE GAMBAR AI
    const isImageReq = message && /buatkan|generate|bikin|lukis|gambar|foto|terbitkan/i.test(message) &&
                       /gambar|foto|lukisan|image|art|anime|pemandangan|karakter/i.test(message);

    if (isImageReq) {
      try {
        console.log(`🎨 Memproses permintaan Generate Gambar AI: "${message}"`);
        const imageModels = ['imagen-3.0-generate-002', 'imagen-3.0-fast-generate-001'];
        let imgResult = null;

        for (const imgModel of imageModels) {
          try {
            const imgRes = await ai.models.generateImages({
              model: imgModel,
              prompt: message,
              config: {
                numberOfImages: 1,
                outputMimeType: 'image/png',
                aspectRatio: '1:1',
              },
            });

            if (imgRes && imgRes.generatedImages && imgRes.generatedImages.length > 0) {
              const base64Img = imgRes.generatedImages[0].image.imageBytes;
              imgResult = `![Hasil AI Aurelia](data:image/png;base64,${base64Img})\n\nBerikut adalah gambar hasil karya Aurelia untuk Kakak! ✨💖`;
              break;
            }
          } catch (e) {
            console.warn(`⚠️ Model gambar ${imgModel} kendala, mencoba alternatif...`);
          }
        }

        if (imgResult) {
          return res.json({ reply: imgResult });
        }
      } catch (imgErr) {
        console.error('Error Generate Gambar:', imgErr);
      }
    }

    // JIKA BUKAN GENERATE GAMBAR -> PROSES CHAT TEKS & MULTIMODAL DENGAN CASCADE HIERARKI MODEL
    const difficulty = determineDifficulty(message, !!file);
    const modelsToTry = getModelCascade(difficulty);

    console.log(`🧠 Tingkat Kesulitan: [${difficulty.toUpperCase()}] | Urutan Tangga Model:`, modelsToTry);

    let contentsPayload = [];
    if (message) contentsPayload.push({ text: message });

    if (file) {
      contentsPayload.push({
        inlineData: {
          mimeType: file.mimetype,
          data: file.buffer.toString('base64')
        }
      });
      contentsPayload.push({
        text: `[File terlampir: ${file.originalname}]. Mohon bedah dan kerjakan secara terperinci, mendalam, serta step-by-step.`
      });
    }

    let responseText = null;
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`📡 Menghubungi model: ${modelName}...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: contentsPayload,
          config: {
            systemInstruction: AURELIA_SYSTEM_INSTRUCTION,
          },
        });

        if (response && response.text) {
          responseText = response.text;
          console.log(`✅ Berhasil menggunakan model: ${modelName}`);
          break;
        }
      } catch (err) {
        console.warn(`⚠️ Model ${modelName} ditolak/kendala, melompat ke tangga berikutnya...`);
        lastError = err;
      }
    }

    if (responseText) {
      return res.json({ reply: responseText });
    } else {
      throw lastError || new Error('Semua tingkatan model Gemini 3.x tidak dapat dijangkau.');
    }

  } catch (error) {
    console.error('Error Server:', error);
    return res.status(500).json({ error: 'Aurelia mengalami gangguan koneksi.' });
  }
});

app.listen(PORT, () => {
  console.log(`✨ TempatBelajar by Edra aktif di http://localhost:${PORT}`);
});