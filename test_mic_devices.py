import sounddevice as sd
import numpy as np
import time
import math
import sys

devices_to_test = [1, 12, 0]  # 1=Realtek Audio, 12=Realtek HD Mic input, 0=Sound Mapper

for dev in devices_to_test:
    try:
        d = sd.query_devices(dev)
        print(f"\nTesting device {dev}: {d['name']}")
        print("Speak NOW for 3 seconds...")
        
        max_level = 0
        samples = []
        
        def cb(indata, frames, time_info, status):
            rms = math.sqrt(np.mean(indata**2))
            level = int(min(100, rms * 500))
            samples.append(level)
        
        with sd.InputStream(samplerate=16000, channels=1, dtype='float32',
                            blocksize=4096, callback=cb, device=dev):
            time.sleep(3)
        
        if samples:
            avg = sum(samples) / len(samples)
            peak = max(samples)
            print(f"  Average: {avg:.0f}% | Peak: {peak}%")
            if peak > 60:
                print(f"  --> GOOD: This device hears you clearly! Use device={dev}")
            else:
                print(f"  --> Low volume: {peak}% peak (expected 70%+ when speaking)")
    except Exception as e:
        print(f"  Device {dev} error: {e}")

print("\nDone.")
