import dayjs from "dayjs";
import React from "react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

// datetime-local requires YYYY-MM-DDTHH:mm (ISO 8601 with T). No min/max so past and future dates are allowed.
const DATETIME_LOCAL_FORMAT = "YYYY-MM-DDTHH:mm";

const formatForInput = (date: Date): string => {
  return dayjs(date).format(DATETIME_LOCAL_FORMAT);
};

interface Props {
  value: Date;
  onChange: (date: Date) => void;
}

const DateTimeInput: React.FC<Props> = ({ value, onChange }) => {
  const [inputValue, setInputValue] = React.useState(() => formatForInput(value));

  // Keep input in sync when parent changes value (e.g. calendar filter).
  React.useEffect(() => {
    setInputValue(formatForInput(value));
  }, [value.getTime()]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);
    if (raw) {
      const date = dayjs(raw).toDate();
      if (!Number.isNaN(date.getTime())) {
        onChange(date);
      }
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw) {
      const date = dayjs(raw).toDate();
      if (!Number.isNaN(date.getTime())) {
        onChange(date);
      } else {
        toast.error("Invalid datetime format.");
        setInputValue(formatForInput(value));
      }
    } else {
      setInputValue(formatForInput(value));
    }
  };

  return (
    <input
      type="datetime-local"
      className={cn("px-1 bg-transparent rounded text-xs transition-all", "border-transparent outline-none focus:border-border", "border")}
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      step={60}
    />
  );
};

export default DateTimeInput;
