import React, {
  FC,
  KeyboardEvent,
  ChangeEvent,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { useRecoilValue } from "recoil";
import { Picker, EmojiData } from "emoji-mart";
import { usePubNub } from "pubnub-react";
import {
  CurrentChannelAtom,
  EmojiMartOptionsAtom,
  ThemeAtom,
  TypingIndicatorTimeoutAtom,
  UsersMetaAtom,
  ErrorFunctionAtom,
} from "../state-atoms";
import "./message-input.scss";
import "emoji-mart/css/emoji-mart.css";

export interface MessageInputProps {
  /** Set a placeholder message display in the text window. */
  placeholder?: string;
  /** Set a draft message to display in the text window. */
  draftMessage?: string;
  /** Enable this for high-throughput environemnts to attach sender data directly to each message */
  senderInfo?: boolean;
  /** Enable/disable firing the typing events when user is typing a message. */
  typingIndicator?: boolean;
  /** Hides the Send button */
  hideSendButton?: boolean;
  /** Custom UI component to override default display for the send button. */
  sendButton?: JSX.Element | string;
  /** Show the built-in emoji picker in the message input.*/
  emojiPicker?: boolean;
  /** Callback to handle event when the text value changes. */
  onChange?: (value: string) => unknown;
  /** Callback for extra actions while sending a message */
  onSend?: (value: unknown) => unknown;
}

/**
 * Allows users to compose messages using text and emojis
 * and automatically publish them on PubNub channels upon sending.
 */
export const MessageInput: FC<MessageInputProps> = (props: MessageInputProps) => {
  const pubnub = usePubNub();

  const [text, setText] = useState(props.draftMessage || "");
  const [emojiPickerShown, setEmojiPickerShown] = useState(false);
  const [typingIndicatorSent, setTypingIndicatorSent] = useState(false);

  const users = useRecoilValue(UsersMetaAtom);
  const theme = useRecoilValue(ThemeAtom);
  const channel = useRecoilValue(CurrentChannelAtom);
  const onError = useRecoilValue(ErrorFunctionAtom).function;
  const emojiMartOptions = useRecoilValue(EmojiMartOptionsAtom);
  const typingIndicatorTimeout = useRecoilValue(TypingIndicatorTimeoutAtom);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  /*
  /* Helper functions
  */

  const autoSize = () => {
    const input = inputRef.current;
    if (!input) return;

    setTimeout(() => {
      input.style.cssText = `height: auto;`;
      input.style.cssText = `height: ${input.scrollHeight}px;`;
    }, 0);
  };

  /*
  /* Commands
  */

  const sendMessage = async () => {
    try {
      if (!text) return;
      const message = {
        type: "text",
        text,
        ...(props.senderInfo && { sender: users.find((u) => u.id === pubnub.getUUID()) }),
      };

      await pubnub.publish({ channel, message });
      props.onSend && props.onSend(message);
      if (props.typingIndicator) stopTypingIndicator();
      setText("");
    } catch (e) {
      onError(e);
    }
  };

  const startTypingIndicator = async () => {
    if (typingIndicatorSent) return;
    try {
      setTypingIndicatorSent(true);
      const message = { message: { type: "typing_on" }, channel };
      pubnub.signal(message);
    } catch (e) {
      onError(e);
    }
  };

  const stopTypingIndicator = async () => {
    if (!typingIndicatorSent) return;
    try {
      setTypingIndicatorSent(false);
      const message = { message: { type: "typing_off" }, channel };
      pubnub.signal(message);
    } catch (e) {
      onError(e);
    }
  };

  /*
  /* Event handlers
  */

  const handleEmojiInsertion = (emoji: EmojiData) => {
    try {
      if (!("native" in emoji)) return;
      setText(text + emoji.native);
      setEmojiPickerShown(false);
    } catch (e) {
      onError(e);
    }
  };

  const handleOpenPicker = () => {
    try {
      setEmojiPickerShown(true);
      document.addEventListener("click", handleClosePicker);
    } catch (e) {
      onError(e);
    }
  };

  const handleClosePicker = useCallback(
    (event: MouseEvent) => {
      try {
        if (pickerRef?.current?.contains(event.target as Node)) return;
        setEmojiPickerShown(false);
        document.removeEventListener("click", handleClosePicker);
      } catch (e) {
        onError(e);
      }
    },
    [pickerRef?.current, emojiPickerShown]
  );

  const handleKeyPress = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    try {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    } catch (e) {
      onError(e);
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    try {
      const textArea = event.target as HTMLTextAreaElement;
      const newText = textArea.value;

      if (props.typingIndicator && newText.length) startTypingIndicator();
      if (props.typingIndicator && !newText.length) stopTypingIndicator();

      props.onChange && props.onChange(newText);
      autoSize();
      setText(newText);
    } catch (e) {
      onError(e);
    }
  };

  /*
  /* Lifecycle
  */

  useEffect(() => {
    return () => {
      document.removeEventListener("click", handleClosePicker);
    };
  }, []);

  useEffect(() => {
    let timer = null;

    if (typingIndicatorSent) {
      timer = setTimeout(() => {
        setTypingIndicatorSent(false);
      }, (typingIndicatorTimeout - 1) * 1000);
    }

    return () => clearTimeout(timer);
  }, [typingIndicatorSent]);

  /*
  /* Renderers
  */

  const renderEmojiPicker = () => {
    return (
      <>
        <div className="pn-msg-input__icon" onClick={() => handleOpenPicker()}>
          ☺
        </div>

        {emojiPickerShown && (
          <div className="pn-msg-input__emoji-picker" ref={pickerRef}>
            <Picker {...emojiMartOptions} onSelect={(e: EmojiData) => handleEmojiInsertion(e)} />
          </div>
        )}
      </>
    );
  };

  return (
    <div className={`pn-msg-input pn-msg-input--${theme}`}>
      <div className="pn-msg-input__wrapper">
        <div className="pn-msg-input__spacer">
          <textarea
            className="pn-msg-input__textarea"
            placeholder={props.placeholder}
            rows={1}
            value={text}
            onChange={(e) => handleInputChange(e)}
            onKeyPress={(e) => handleKeyPress(e)}
            ref={inputRef}
          />
        </div>

        {props.emojiPicker && renderEmojiPicker()}

        {!props.hideSendButton && (
          <button className="pn-msg-input__send" onClick={() => sendMessage()}>
            {props.sendButton}
          </button>
        )}
      </div>
    </div>
  );
};

MessageInput.defaultProps = {
  emojiPicker: false,
  hideSendButton: false,
  placeholder: "Type Message",
  sendButton: "Send",
  senderInfo: false,
  typingIndicator: false,
};
