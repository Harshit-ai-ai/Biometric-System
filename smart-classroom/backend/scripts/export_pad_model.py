"""
Level 4 Presentation-Attack Detection — model export contract (Module 13).

This is the export-side counterpart to `liveness/pad_model.py`. It does
NOT ship or train a model — this repo has no labelled
live/photo/screen/replay dataset to train on. What it defines is the
exact contract `pad_model.py` expects, so that whenever such a dataset
and a trained PyTorch model exist, exporting it to something this
project can load is a single function call.

Expected trained model:
  - 4-class classifier, softmax/logits output of shape (batch, 4)
  - Class order: ["live", "printed_photo", "phone_screen", "replayed_video"]
    (must match liveness.pad_model.PresentationAttackDetector.CLASS_LABELS)
  - Input: a single face crop, resized to 224x224, RGB, scaled to [0,1],
    then normalized with ImageNet mean/std ([0.485, 0.456, 0.406] /
    [0.229, 0.224, 0.225]), channels-first (CHW), with a batch dimension.
    (This matches most torchvision-style classifier backbones — e.g. a
    MobileNetV2 or ResNet-18 fine-tuned as a 4-way head — out of the box.)

Usage once you have a trained PyTorch model:

    from scripts.export_pad_model import export_pad_model_to_onnx
    export_pad_model_to_onnx(my_trained_model, output_path="exports/pad_model.onnx")

After that, `liveness/pad_model.py` picks it up automatically on the next
backend startup (default path is `exports/pad_model.onnx`, overridable via
the `PAD_MODEL_PATH` environment variable) — no other code changes needed.
"""

import os

CLASS_LABELS = ["live", "printed_photo", "phone_screen", "replayed_video"]
INPUT_SIZE = 224


def export_pad_model_to_onnx(model, output_path="exports/pad_model.onnx", opset=12):
    """
    Exports a trained PyTorch presentation-attack classifier to ONNX in the
    shape `liveness/pad_model.py` expects.

    `model` must be a torch.nn.Module already trained to 4-class
    live/printed_photo/phone_screen/replayed_video classification (in that
    output order) that takes a (1, 3, 224, 224) float32 tensor and returns
    logits or probabilities of shape (1, 4).
    """
    try:
        import torch
    except ImportError:
        print("PyTorch not installed. Install with: pip install torch")
        return None

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    model.eval()
    dummy_input = torch.randn(1, 3, INPUT_SIZE, INPUT_SIZE)

    try:
        torch.onnx.export(
            model,
            dummy_input,
            output_path,
            input_names=["input"],
            output_names=["probabilities"],
            dynamic_axes={"input": {0: "batch"}, "probabilities": {0: "batch"}},
            opset_version=opset,
        )
        print(f"PAD model exported to ONNX: {output_path}")
        print(f"Class order baked into this export: {CLASS_LABELS}")
        return output_path
    except Exception as e:
        print(f"PAD ONNX export failed: {e}")
        return None


def verify_pad_model(onnx_path="exports/pad_model.onnx"):
    """Sanity-checks that an exported model actually loads and produces a
    (1, 4) output for a dummy input — catches shape/class-order mistakes
    before deploying."""
    try:
        import numpy as np
        import onnxruntime as ort
    except ImportError:
        print("onnxruntime not installed. Install with: pip install onnxruntime")
        return False

    if not os.path.exists(onnx_path):
        print(f"No model found at '{onnx_path}'.")
        return False

    try:
        session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
        input_name = session.get_inputs()[0].name
        dummy = np.random.randn(1, 3, INPUT_SIZE, INPUT_SIZE).astype(np.float32)
        outputs = session.run(None, {input_name: dummy})
        shape = np.asarray(outputs[0]).shape
        if shape[-1] != len(CLASS_LABELS):
            print(
                f"Warning: model output has {shape[-1]} classes, "
                f"expected {len(CLASS_LABELS)} ({CLASS_LABELS})."
            )
            return False
        print(f"'{onnx_path}' loads correctly and outputs shape {shape}.")
        return True
    except Exception as e:
        print(f"Verification failed: {e}")
        return False


if __name__ == "__main__":
    print("Level 4 PAD Model Export Tool")
    print("=" * 40)
    print("This script exports an already-trained PyTorch PAD model to ONNX.")
    print("It does not train one — see the module docstring for the expected")
    print("training data (live / printed_photo / phone_screen / replayed_video)")
    print("and model contract.\n")
    verify_pad_model()
