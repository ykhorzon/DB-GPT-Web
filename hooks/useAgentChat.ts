import {
  EventStreamContentType,
  fetchEventSource,
} from '@microsoft/fetch-event-source';
import useStateReducer from './useStateReducer';
import { Message } from '@/types';
import { useEffect } from 'react';
import { useDialogueContext } from '@/app/context/dialogue';

type Props = {
  queryAgentURL: string;
  channel?: "dashboard" | "website" | "slack" | "crisp";
  queryBody?: any;
  initHistory?: Message[];
  runHistoryList?: () => void;
};

const useAgentChat = ({
  queryAgentURL,
  channel,
  queryBody,
  initHistory,
  runHistoryList
}: Props) => {
  const [state, setState] = useStateReducer({
    history: (initHistory || []) as { role: 'human' | 'view'; context: string; id?: string }[],
  });

  const { refreshDialogList } = useDialogueContext();
  const ctrl = new AbortController();

  useEffect(() => {
    if (initHistory) setState({ history: initHistory });
  }, [initHistory]);

  const handleChatSubmit = async (context: string, otherQueryBody?: any) => {
    if (!context) {
      return;
    }

    const history = [...state.history, { role: 'human', context }];
    const nextIndex = history.length;

    setState({
      history: history as any,
    });

    let answer = '';

    try {
      await fetchEventSource(`${process.env.API_BASE_URL ? process.env.API_BASE_URL : ''}${"/api" + queryAgentURL}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...otherQueryBody,
          ...queryBody,
          user_input: context,
          channel,
        }),
        signal: ctrl.signal,
        async onopen(response) {
          if (history.length <= 1) {
            refreshDialogList();
            const searchParams = new URLSearchParams(window.location.search);
            searchParams.delete('initMessage');
            window.history.replaceState(null, null, `?${searchParams.toString()}`);
          }
          if (
            response.ok &&
            response.headers.get('content-type') === EventStreamContentType
          ) {
            return; // everything's good
          } else if (
            response.status >= 400 &&
            response.status < 500 &&
            response.status !== 429
          ) {
            if (response.status === 402) {
              //throw new ApiError(ApiErrorType.USAGE_LIMIT);
            }
            // client-side errors are usually non-retriable:
            //throw new FatalError();
          } else {
            //throw new RetriableError();
          }
        },
        onclose() {
          // if the server closes the connection unexpectedly, retry:
          console.log('onclose');
        },
        onerror(err) {       
          console.log('onerror');     
          throw new Error(err);
        },
        onmessage: (event) => {
          event.data = event.data.replaceAll('\\n', '\n');
          
          if (event.data === '[DONE]') {
            // ctrl.abort();
          } else if (event.data?.startsWith('[ERROR]')) {
            //ctrl.abort();
            setState({
              history: [
                ...history,
                {
                  role: 'view',
                  context: event.data.replace('[ERROR]', ''),
                } as any,
              ],
            });
          } else {
            const h = [...history];
            if (event.data) {
              if (h?.[nextIndex]) {
                h[nextIndex].context = `${event.data}`;
              } else {
                h.push({ role: 'view', context: event.data });
              }
              setState({
                history: h as any,
              });
            }
            
          }
        },
      });
    } catch (err) {
      console.log(err);

      setState({
        history: [
          ...history,
          { role: 'view', context: answer || '请求出错' as string },
        ] as any,
      });
    }
  };

  return {
    handleChatSubmit,
    history: state.history,
  };
};

export default useAgentChat;
