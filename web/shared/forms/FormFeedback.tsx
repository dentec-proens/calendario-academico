import { Notice } from '../../components/ui/Notice.tsx';

export function FormFeedback({ error }: { error: string }) {
  return error ? (
    <Notice tone="danger" announce="assertive" className="form-feedback">
      {error}
    </Notice>
  ) : null;
}
