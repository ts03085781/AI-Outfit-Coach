type PhotoStepProps = {
  hasPhoto: boolean;
  error?: string;
  onChoosePhoto: (file?: File) => void;
  onContinue: () => void;
};

export function PhotoStep({ hasPhoto, error, onChoosePhoto, onContinue }: PhotoStepProps) {
  return (
    <section aria-labelledby="photo-title">
      <h1 id="photo-title">拍下完整穿搭</h1>
      <p>請站遠一點，讓上衣、下身與鞋子都入鏡。</p>
      <label className="photo-picker" htmlFor="outfit-photo">
        <span>{hasPhoto ? "已選好照片，想換一張嗎？" : "開啟相機或選擇照片"}</span>
        <input
          id="outfit-photo"
          aria-label="上傳穿搭照片"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(event) => onChoosePhoto(event.target.files?.[0])}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <button className="primary-action" type="button" disabled={!hasPhoto} onClick={onContinue}>
        繼續
      </button>
    </section>
  );
}
