-- =============================================================
-- CPMK 2 (Tahap II: Perancangan & Implementasi Basis Data)
-- Tabel terpisah dari `assessments` — data CPMK 1 tidak tersentuh.
-- Aman dijalankan berulang; reversibel dengan DROP tanpa menyentuh tabel lain.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.assessments_cpmk2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','verified')),
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS assessments_cpmk2_student ON public.assessments_cpmk2(student_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessments_cpmk2 TO authenticated;
GRANT ALL ON public.assessments_cpmk2 TO service_role;
ALTER TABLE public.assessments_cpmk2 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assessments_cpmk2_all" ON public.assessments_cpmk2;
CREATE POLICY "assessments_cpmk2_all" ON public.assessments_cpmk2
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Audit: riwayat memakai tabel assessment_logs yang sudah ada (component = "CPMK2 · ..."),
-- jadi pola log admin tetap satu tempat.
CREATE INDEX IF NOT EXISTS assessment_logs_component_time
  ON public.assessment_logs(component, created_at DESC);

DROP TRIGGER IF EXISTS assessments_cpmk2_touch ON public.assessments_cpmk2;
CREATE TRIGGER assessments_cpmk2_touch BEFORE UPDATE ON public.assessments_cpmk2
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
