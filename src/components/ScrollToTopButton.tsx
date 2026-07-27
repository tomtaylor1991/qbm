import {
  useEffect,
  useState
} from "react";

export default function ScrollToTopButton() {
  const [visible, setVisible] =
    useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(
        window.scrollY > 450
      );
    }

    handleScroll();

    window.addEventListener(
      "scroll",
      handleScroll,
      {
        passive: true
      }
    );

    return () => {
      window.removeEventListener(
        "scroll",
        handleScroll
      );
    };
  }, []);

  function handleScrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      className="scroll-to-top-button"
      onClick={handleScrollToTop}
      aria-label="Ugrás az oldal tetejére"
      title="Ugrás a tetejére"
    >
      ▲
    </button>
  );
}