// ONNX Runtime reads this process-local opt-out when its native environment is initialized.
export const loadLocalTransformers = () => {
  process.env.ORT_DISABLE_TELEMETRY = '1';
  return import('@huggingface/transformers');
};
