"""Official Chatterbox subprocess adapter, launched with its managed interpreter."""
import argparse
import torch
import torchaudio as ta
from chatterbox.tts import ChatterboxTTS

parser = argparse.ArgumentParser(); parser.add_argument("--text", required=True); parser.add_argument("--reference", required=True); parser.add_argument("--output", required=True); parser.add_argument("--device", default="cuda")
args = parser.parse_args(); device = args.device if args.device != "cuda" or torch.cuda.is_available() else "cpu"
model = ChatterboxTTS.from_pretrained(device=device); wav = model.generate(args.text, audio_prompt_path=args.reference); ta.save(args.output, wav, model.sr)
