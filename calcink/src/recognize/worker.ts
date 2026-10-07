/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
ort.env.wasm.numThreads = 1;


const sessionDigits = ort.InferenceSession.create('/models/mnist-12.onnx', { executionProviders: ['wasm'] });
const sessionSymbols = ort.InferenceSession.create('/models/math-symbols.onnx', { executionProviders: ['wasm'] });

const reportReady = async(): Promise<void> =>
{
    try
    {
        const [digits, symbols] = await Promise.all([sessionDigits, sessionSymbols]);
        self.postMessage({ type: 'ready', digitNames: digits.outputNames, symbolNames: symbols.outputNames });
    }
    catch(error)
    {
        self.postMessage({ type: 'error',  error: String(error)});
    }
}



const messageHandler = async (event: MessageEvent) => 
{
    try
    {
        const {model,input} = event.data;

        const sess = await (model === 'digit' ? sessionDigits : sessionSymbols);
        const shape = model === 'symbol' ? [1, 1024] : [1, 1, 28, 28];

        const tensor = new ort.Tensor('float32', input, shape);

        const result = await sess.run({ [sess.inputNames[0]]: tensor });
        const output = result[sess.outputNames[0]].data as Float32Array;
        self.postMessage({ type: 'result', output: Array.from(output) });
    }

    catch(error)
    {
        self.postMessage({ type: 'error', message: String(error) });
    }
}

self.onmessage = messageHandler;
reportReady();