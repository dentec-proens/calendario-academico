import {
  FaceAngry,
  FaceGrinning,
  FaceNeutral,
  FaceSlightlyFrowning,
  FaceSlightlySmiling,
  type LucideIcon,
} from 'lucide-react';

/** One face per rating, from 1 (“Muito difícil”) to 5 (“Muito fácil”). */
export const ratingFaces: readonly LucideIcon[] = [
  FaceAngry,
  FaceSlightlyFrowning,
  FaceNeutral,
  FaceSlightlySmiling,
  FaceGrinning,
];
