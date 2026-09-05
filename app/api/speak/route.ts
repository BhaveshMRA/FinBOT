// ponytail: no ElevenLabs SDK dependency for one endpoint call - plain fetch.
// Degrades silently (per Implementation.md §9) if no key is configured: the
// client just won't play audio, nothing crashes.
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // "Rachel" - default voice on every ElevenLabs account

export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 501 });
  }

  const { text } = await req.json();
  if (!text || typeof text !== "string") {
    return Response.json({ error: "missing text" }, { status: 400 });
  }

  const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: text.slice(0, 2000), // keep the demo cheap - cap spoken length
      model_id: "eleven_turbo_v2_5",
    }),
  });

  if (!elevenRes.ok) {
    const errText = await elevenRes.text();
    console.warn("[speak] ElevenLabs error:", elevenRes.status, errText);
    return Response.json({ error: "TTS request failed" }, { status: 502 });
  }

  return new Response(elevenRes.body, { headers: { "Content-Type": "audio/mpeg" } });
}
