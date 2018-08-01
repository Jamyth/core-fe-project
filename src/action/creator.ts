import {Handler} from "./handler";
import {Action} from "../type";
import {Listener} from "./listener";

type ActionCreatorX<P extends any[]> = (...args: P) => Action<P>;
type ActionCreator<H> = H extends <P>(...args: infer P) => any ? ActionCreatorX<P> : never;

export type ActionCreators<H> = {readonly [K in Exclude<keyof H, "state" | "rootState" | "namespace" | keyof Listener>]: ActionCreator<H[K]>};

export function actionCreator<H extends Handler<any>>(handler: H): ActionCreators<H> {
    const actionCreators = {};

    const keys = [...Object.keys(Object.getPrototypeOf(handler)), "resetState"];
    keys.forEach(actionType => {
        const qualifiedActionType = `${handler.namespace}/${actionType}`;
        actionCreators[actionType] = (...payload: any[]): Action<any[]> => ({type: qualifiedActionType, payload});
    });

    return actionCreators as ActionCreators<H>;
}
