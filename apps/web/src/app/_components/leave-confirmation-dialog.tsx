'use client';

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/**
 * 未保存の変更がある画面から離れようとしたときの確認ダイアログ。
 * ブラウザバック起因ではトリガー要素が存在しないため、制御モード（open / onOpenChange）で使う。
 */
export function LeaveConfirmationDialog({ open, onOpenChange, onConfirm }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>本当に戻りますか？</AlertDialogTitle>
        <AlertDialogDescription>入力した内容は保存されません。</AlertDialogDescription>
        <div className="mt-4 flex justify-end gap-2">
          <AlertDialogClose
            render={
              <Button type="button" variant="outline" className="h-9">
                編集を続ける
              </Button>
            }
          />
          <Button type="button" variant="destructive" onClick={onConfirm} className="h-9">
            戻る
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
