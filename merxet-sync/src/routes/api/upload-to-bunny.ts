import express, {Request, Response} from 'express';
import multer from 'multer';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const upload = multer({storage: multer.memoryStorage()});

const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE!;
const BUNNY_API_KEY = process.env.BUNNY_API_KEY!;
const BUNNY_BASE_URL = `https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}`;

router.post('/image', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const filename = req.body.path;

    if (!file || !filename) {
      return res.status(400).json({error: 'Missing file or path'});
    }

    const uploadUrl = `${BUNNY_BASE_URL}/${filename}`;
    const response = await axios.put(uploadUrl, file.buffer, {
      headers: {
        AccessKey: BUNNY_API_KEY,
        'Content-Type': 'application/octet-stream',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    res.status(200).json({success: true});
  } catch (err: any) {
    console.error('Upload error:', err.response?.data || err.message);
    res.status(500).json({error: err.message});
  }
});

router.post('/json', async (req: Request, res: Response) => {
  try {
    const {path, content} = req.body;

    if (!path || !content) {
      return res.status(400).json({error: 'Missing path or content'});
    }

    const uploadUrl = `${BUNNY_BASE_URL}/${path}`;
    const response = await axios.put(uploadUrl, JSON.stringify(content), {
      headers: {
        AccessKey: BUNNY_API_KEY,
        'Content-Type': 'application/json',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    res.status(200).json({success: true});
  } catch (err: any) {
    console.error('JSON upload error:', err.response?.data || err.message);
    res.status(500).json({error: err.message});
  }
});

export default router;
