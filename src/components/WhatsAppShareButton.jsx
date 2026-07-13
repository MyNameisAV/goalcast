/**
 * WhatsApp share. Native share sheet first (best on mobile);
 * falls back to the universal api.whatsapp.com link, which also opens
 * WhatsApp Web on desktop. Same-tab navigation — iOS hands off to the
 * app far more reliably than from a new-tab popup.
 */
export default function WhatsAppShareButton({ text, children }) {
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* sheet closed — fall through */
      }
    }
    window.location.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  };
  return (
    <button type="button" onClick={share} className="plate plate--gold text-sm">
      <span>{children ?? "Share on WhatsApp"}</span>
    </button>
  );
}
