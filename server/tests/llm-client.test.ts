import { extractText, HttpLlmClient, LlmError } from '../src/services/llm.client';

describe('extractText - tolerant response parsing', () => {
  it.each([
    ['plain string', 'Hello', 'Hello'],
    ['{response}', { response: 'A' }, 'A'],
    ['{text}', { text: 'B' }, 'B'],
    ['{data:{answer}}', { data: { answer: 'C' } }, 'C'],
    ['OpenAI shape', { choices: [{ message: { content: 'D' } }] }, 'D'],
    ['Anthropic shape', { content: [{ type: 'text', text: 'E' }] }, 'E'],
    ['{success,data:{content}}', { success: true, data: { content: 'F' } }, 'F'],
  ])('%s', (_name, body, expected) => expect(extractText(body)).toBe(expected));

  it('returns undefined for unknown/empty bodies', () => {
    expect(extractText({ foo: 1 })).toBeUndefined();
    expect(extractText('   ')).toBeUndefined();
    expect(extractText(null)).toBeUndefined();
  });
});

describe('HttpLlmClient', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  const res = (status: number, body: unknown) =>
    ({ ok: status < 400, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }) as Response;

  it('sends the bearer token, prompt and metadata', async () => {
    const fetchMock = jest.fn().mockResolvedValue(res(200, { response: 'hi' }));
    global.fetch = fetchMock;
    const c = new HttpLlmClient('https://llm.example', 'tok', 1000, 0, true);
    await expect(c.complete({ prompt: 'p', metadata: { traceId: 't1' } })).resolves.toBe('hi');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://llm.example/llm/query');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ prompt: 'p', metadata: { traceId: 't1' } });
  });

  it('retries on 5xx then succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(res(503, 'busy'))
      .mockResolvedValueOnce(res(200, { text: 'ok' }));
    global.fetch = fetchMock;
    const c = new HttpLlmClient('https://llm.example', 'tok', 1000, 1, true);
    await expect(c.complete({ prompt: 'p' })).resolves.toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 401', async () => {
    const fetchMock = jest.fn().mockResolvedValue(res(401, 'nope'));
    global.fetch = fetchMock;
    const c = new HttpLlmClient('https://llm.example', 'bad', 1000, 2, true);
    await expect(c.complete({ prompt: 'p' })).rejects.toBeInstanceOf(LlmError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when disabled', async () => {
    await expect(new HttpLlmClient('https://x', '', 1000, 0, false).complete({ prompt: 'p' })).rejects.toThrow('LLM disabled');
  });
});
