"""cutout.py: ONNX Runtime provider list (CUDA when the installed onnxruntime reports it, CPU otherwise).
Run: python -m unittest discover -s scripts -p 'test_cutout_providers.py'
"""
import sys, types, unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cutout  # noqa: E402


class Providers(unittest.TestCase):
    def test_cpu_only_build_stays_cpu(self):  # the macOS wheel reports CPU (and Azure) only
        self.assertEqual(cutout.providers_for(["AzureExecutionProvider", "CPUExecutionProvider"]), ["CPUExecutionProvider"])

    def test_cuda_first_with_cpu_fallback(self):
        self.assertEqual(cutout.providers_for(["CUDAExecutionProvider", "CPUExecutionProvider"]),
                         ["CUDAExecutionProvider", "CPUExecutionProvider"])

    def test_onnx_providers_reads_the_installed_runtime(self):
        fake = types.ModuleType("onnxruntime")
        fake.get_available_providers = lambda: ["CUDAExecutionProvider", "CPUExecutionProvider"]
        with mock.patch.dict(sys.modules, {"onnxruntime": fake}):
            self.assertEqual(cutout.onnx_providers(), ["CUDAExecutionProvider", "CPUExecutionProvider"])
        fake.get_available_providers = lambda: ["CPUExecutionProvider"]
        with mock.patch.dict(sys.modules, {"onnxruntime": fake}):
            self.assertEqual(cutout.onnx_providers(), ["CPUExecutionProvider"])

    def test_missing_onnxruntime_falls_back_to_cpu(self):
        with mock.patch.dict(sys.modules, {"onnxruntime": None}):
            self.assertEqual(cutout.onnx_providers(), ["CPUExecutionProvider"])


if __name__ == "__main__":
    unittest.main()
