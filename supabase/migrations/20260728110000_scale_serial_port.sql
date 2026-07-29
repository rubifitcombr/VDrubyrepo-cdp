-- Porta serial da balança no PC local (referência para o Print Agent).
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS scale_serial_port text;

COMMENT ON COLUMN public.stores.scale_serial_port IS
  'Porta serial da balança no PC do agente (ex.: COM3, /dev/ttyUSB0).';
