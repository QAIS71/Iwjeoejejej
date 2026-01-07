// netlify/functions/generate.js
// POST JSON body: { imageBase64, imageMimeType, region, lang }
// Requires environment variable GENAI_API_KEY to be set in Netlify site settings.

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const body = JSON.parse(event.body || '{}');
    const { imageBase64, imageMimeType = 'image/png', region = 'Earth', lang = 'en' } = body;

    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing imageBase64' }) };
    }

    const apiKey = process.env.GENAI_API_KEY;
    const model = process.env.GENAI_MODEL || 'gemini-1.5-mini'; // يمكنك تغييره لاحقًا عبر env

    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured: missing GENAI_API_KEY' }) };
    }

    // اكتب البـ prompt هنا — يمكنك تعديله لاحقًا
    const prompt = `A hyper-realistic 8K first-person perspective inside the ISS Cupola. 
A real astronaut in a detailed white space suit holds a glossy printed photograph showing the face from the provided image. 
Soft reflections on the photo surface, natural finger shadows, cinematic ISS interior lighting matching the photo. 
Background through the cupola shows a breathtaking Earth over ${region}. Ultra realistic, no AI artifacts.`;

    const requestBody = {
      // شكل عام مطابق لواجهات GenAI: contents parts -> text + inlineData
      // قد يختلف اسم الموديل/نسخة حسب توفر حسابك؛ اجعل MODEL env قابل للتعديل.
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: imageMimeType, data: imageBase64 } }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
        // يمكنك إضافة إعدادات إضافية هنا إن أردت: imageQuality, safetySettings... (حسب توفر API)
      }
    };

    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      timeout: 120000
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { statusCode: resp.status, body: JSON.stringify({ error: 'Upstream error', details: text }) };
    }

    const data = await resp.json();

    // نحاول استخراج الصورة من المسار المتوقع
    const candidate = data?.candidates?.[0];
    const part = candidate?.content?.parts?.find(p => p.inlineData && p.inlineData.data);
    const imageBase64Out = part?.inlineData?.data;

    if (!imageBase64Out) {
      // أضف محاولة استخراج بدائل إن اختلفت الصيغة
      return { statusCode: 502, body: JSON.stringify({ error: 'No image generated', raw: data }) };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ imageBase64: imageBase64Out, mimeType: part.inlineData.mimeType || 'image/png' })
    };

  } catch (err) {
    console.error('Function error', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};
