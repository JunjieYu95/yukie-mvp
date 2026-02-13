import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest, hasScope, type AuthContext } from './_lib/auth.js';
import { setCors } from './_lib/cors.js';

// ============================================================================
// Types
// ============================================================================

interface TranscriptionResponse {
  text: string;
  duration?: number;
  language?: string;
}

// ============================================================================
// Whisper API Integration
// ============================================================================

async function transcribeWithWhisper(audioBuffer: Buffer, fileName: string): Promise<TranscriptionResponse> {
  // OPENAI_API_KEY required for Whisper; LLM_API_KEY fallback when using OpenAI as LLM provider
  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY or LLM_API_KEY environment variable is not set');
  }

  const model = process.env.WHISPER_MODEL || 'whisper-1';

  // Create form data for multipart upload
  const formData = new FormData();

  // Determine content type based on file extension
  let contentType = 'audio/webm';
  if (fileName.endsWith('.mp3')) {
    contentType = 'audio/mpeg';
  } else if (fileName.endsWith('.wav')) {
    contentType = 'audio/wav';
  } else if (fileName.endsWith('.m4a')) {
    contentType = 'audio/m4a';
  } else if (fileName.endsWith('.ogg')) {
    contentType = 'audio/ogg';
  }

  // Convert Buffer to ArrayBuffer for Blob compatibility
  const arrayBuffer = audioBuffer.buffer.slice(
    audioBuffer.byteOffset,
    audioBuffer.byteOffset + audioBuffer.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: contentType });
  formData.append('file', blob, fileName);
  formData.append('model', model);
  formData.append('response_format', 'verbose_json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    text?: string;
    duration?: number;
    language?: string;
  };

  return {
    text: data.text || '',
    duration: data.duration,
    language: data.language,
  };
}

// ============================================================================
// Multipart Form Data Parser
// ============================================================================

interface ParsedFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

function parseMultipartFormData(body: Buffer, contentType: string): ParsedFile | null {
  // Extract boundary from content type
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
  if (!boundaryMatch) {
    return null;
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];

  // Convert body to string for parsing headers, but keep buffer for binary data
  const bodyStr = body.toString('binary');
  const parts = bodyStr.split(`--${boundary}`);

  for (const part of parts) {
    if (part.trim() === '' || part.trim() === '--') continue;

    // Find the header/body separator (double CRLF)
    const separatorIndex = part.indexOf('\r\n\r\n');
    if (separatorIndex === -1) continue;

    const headerPart = part.substring(0, separatorIndex);
    const bodyPart = part.substring(separatorIndex + 4);

    // Check if this is the file field
    const contentDispositionMatch = headerPart.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?/i);
    if (!contentDispositionMatch || contentDispositionMatch[1] !== 'audio') continue;

    const filename = contentDispositionMatch[2] || 'audio.webm';

    // Extract content type from part headers
    const partContentTypeMatch = headerPart.match(/Content-Type:\s*([^\r\n]+)/i);
    const partContentType = partContentTypeMatch ? partContentTypeMatch[1].trim() : 'audio/webm';

    // Remove trailing boundary markers and convert back to buffer
    // The body part might end with \r\n-- or similar
    let cleanBody = bodyPart;
    if (cleanBody.endsWith('\r\n')) {
      cleanBody = cleanBody.slice(0, -2);
    }

    // Convert binary string back to buffer
    const buffer = Buffer.from(cleanBody, 'binary');

    return {
      buffer,
      filename,
      contentType: partContentType,
    };
  }

  return null;
}

// ============================================================================
// API Handler
// ============================================================================

// Maximum file size: 25MB (Whisper API limit)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Supported audio formats
const SUPPORTED_FORMATS = [
  'audio/webm',
  'audio/mp3',
  'audio/mpeg',
  'audio/mp4',
  'audio/m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/flac',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Generate request ID
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Authenticate
  const authResult = authenticateRequest(
    req.headers.authorization,
    requestId,
    req.headers.cookie as string | undefined
  );
  if (!authResult.success || !authResult.context) {
    res.status(401).json({
      error: 'Unauthorized',
      message: authResult.error || 'Authentication required',
    });
    return;
  }

  const auth: AuthContext = authResult.context;

  // Check for voice scope (or chat scope as fallback)
  if (!hasScope(auth, 'yukie:voice') && !hasScope(auth, 'yukie:chat')) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Missing required scope: yukie:voice or yukie:chat',
    });
    return;
  }

  try {
    const contentType = req.headers['content-type'] || '';

    // Handle multipart form data
    if (!contentType.includes('multipart/form-data')) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Content-Type must be multipart/form-data',
      });
      return;
    }

    // Get raw body as buffer
    const chunks: Buffer[] = [];

    // Vercel provides body as string or object, we need to handle raw buffer
    // For multipart, we need the raw body
    if (Buffer.isBuffer(req.body)) {
      chunks.push(req.body);
    } else if (typeof req.body === 'string') {
      chunks.push(Buffer.from(req.body, 'binary'));
    } else {
      // Body might be pre-parsed, we need raw data
      // In Vercel, we can access raw body through the request stream
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
    }

    const bodyBuffer = Buffer.concat(chunks);

    if (bodyBuffer.length === 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'No audio data received',
      });
      return;
    }

    if (bodyBuffer.length > MAX_FILE_SIZE) {
      res.status(413).json({
        error: 'Payload Too Large',
        message: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      });
      return;
    }

    // Parse multipart form data
    const parsedFile = parseMultipartFormData(bodyBuffer, contentType);
    if (!parsedFile) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Could not parse audio file from request. Make sure to send the file with field name "audio".',
      });
      return;
    }

    // Validate content type
    const isValidFormat = SUPPORTED_FORMATS.some(
      (format) => parsedFile.contentType.toLowerCase().includes(format.split('/')[1])
    );
    if (!isValidFormat) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Unsupported audio format: ${parsedFile.contentType}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`,
      });
      return;
    }

    // Transcribe audio
    console.log(`[TRANSCRIBE] Processing audio file: ${parsedFile.filename} (${parsedFile.buffer.length} bytes)`);

    const result = await transcribeWithWhisper(parsedFile.buffer, parsedFile.filename);

    console.log(`[TRANSCRIBE] Transcription complete: ${result.text.length} characters`);

    res.status(200).json({
      text: result.text,
      duration: result.duration,
      language: result.language,
    });
  } catch (error) {
    console.error('[TRANSCRIBE] Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred during transcription',
    });
  }
}

// Disable body parsing to get raw buffer
export const config = {
  api: {
    bodyParser: false,
  },
};
