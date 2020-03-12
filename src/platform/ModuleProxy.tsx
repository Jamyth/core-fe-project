import React from "react";
import {RouteComponentProps} from "react-router";
import {Task} from "redux-saga";
import {delay} from "redux-saga/effects";
import {app} from "../app";
import {ActionCreators, executeAction} from "../module";
import {navigationPreventionAction} from "../reducer";
import {Module, ModuleLifecycleListener} from "./Module";

export class ModuleProxy<M extends Module<any>> {
    constructor(private module: M, private actions: ActionCreators<M>) {}

    getActions(): ActionCreators<M> {
        return this.actions;
    }

    attachLifecycle<P extends {}>(ComponentType: React.ComponentType<P>): React.ComponentType<P> {
        const moduleName = this.module.name;
        const lifecycleListener = this.module as ModuleLifecycleListener;
        const actions = this.actions as any;

        return class extends React.PureComponent<P> {
            static displayName = `ModuleBoundary(${moduleName})`;
            private readonly lifecycleSagaTask: Task;
            private lastDidUpdateSagaTask: Task | null = null;
            private successTickCount: number = 0;
            private mountedTime: number = Date.now();

            constructor(props: P) {
                super(props);
                this.lifecycleSagaTask = app.sagaMiddleware.run(this.lifecycleSaga.bind(this));
            }

            componentDidUpdate(prevProps: Readonly<P>) {
                const prevLocation = (prevProps as any).location;
                const currentLocation = (this.props as any).location;
                const currentRouteParams = (this.props as any).match ? (this.props as any).match.params : null;
                if (currentLocation && currentRouteParams && prevLocation !== currentLocation && lifecycleListener.onRender.isLifecycle) {
                    // Only trigger onRender if current component is connected to <Route>
                    this.lastDidUpdateSagaTask?.cancel();
                    this.lastDidUpdateSagaTask = app.sagaMiddleware.run(function*() {
                        const locationChangeRenderActionName = `${moduleName}/@@LOCATION_CHANGE_RENDER`;
                        const startTime = Date.now();
                        yield* executeAction(locationChangeRenderActionName, lifecycleListener.onRender.bind(lifecycleListener), currentRouteParams, currentLocation);
                        app.logger.info(locationChangeRenderActionName, {locationParams: JSON.stringify(currentRouteParams)}, Date.now() - startTime);
                    });
                    app.store.dispatch(navigationPreventionAction(false));
                }
            }

            componentWillUnmount() {
                if (lifecycleListener.onDestroy.isLifecycle) {
                    app.store.dispatch(actions.onDestroy());
                }

                const currentLocation = (this.props as any).location;
                if (currentLocation) {
                    // Only cancel navigation prevention if current component is connected to <Route>
                    app.store.dispatch(navigationPreventionAction(false));
                }

                this.lastDidUpdateSagaTask?.cancel();
                this.lifecycleSagaTask.cancel();
                app.logger.info(`${moduleName}/@@DESTROY`, {
                    successTickCount: this.successTickCount.toString(),
                    stayingSecond: ((Date.now() - this.mountedTime) / 1000).toFixed(2),
                });
            }

            render() {
                return <ComponentType {...this.props} />;
            }

            private *lifecycleSaga() {
                /**
                 * CAVEAT:
                 * If lifecycleSagaTask is cancelled executeAction, it will only cancel the action (onRender/onTick...) itself but proceeds with following code.
                 * That's why we need to check this.lifecycleSagaTask.isCancelled() after each lifecycle action.
                 * https://github.com/redux-saga/redux-saga/issues/1986
                 */

                const props = this.props as RouteComponentProps | {};

                const enterActionName = `${moduleName}/@@ENTER`;
                if (lifecycleListener.onEnter.isLifecycle) {
                    const startTime = Date.now();
                    yield* executeAction(enterActionName, lifecycleListener.onEnter.bind(lifecycleListener), props);
                    app.logger.info(enterActionName, {componentProps: JSON.stringify(props)}, Date.now() - startTime);
                    if (this.lifecycleSagaTask.isCancelled()) {
                        return;
                    }
                } else {
                    app.logger.info(enterActionName, {componentProps: JSON.stringify(props)});
                }

                if (lifecycleListener.onRender.isLifecycle) {
                    const initialRenderActionName = `${moduleName}/@@INITIAL_RENDER`;
                    if ("match" in props && "location" in props) {
                        const startTime = Date.now();
                        yield* executeAction(initialRenderActionName, lifecycleListener.onRender.bind(lifecycleListener), props.match.params, props.location);
                        app.logger.info(initialRenderActionName, {locationParams: JSON.stringify(props.match.params)}, Date.now() - startTime);
                    } else {
                        const startTime = Date.now();
                        console.warn(`[framework] Module [${moduleName}] is not attached to routers, use onEnter() lifecycle instead`);
                        yield* executeAction(initialRenderActionName, lifecycleListener.onRender.bind(lifecycleListener), {}, app.browserHistory);
                        app.logger.info(initialRenderActionName, {locationParams: "[Not Route Component]"}, Date.now() - startTime);
                    }
                }
                if (this.lifecycleSagaTask.isCancelled()) {
                    return;
                }

                if (lifecycleListener.onTick.isLifecycle) {
                    const tickIntervalInMillisecond = (lifecycleListener.onTick.tickInterval || 5) * 1000;
                    const boundTicker = lifecycleListener.onTick.bind(lifecycleListener);
                    const tickActionName = `${moduleName}/@@TICK`;
                    while (true) {
                        yield* executeAction(tickActionName, boundTicker);
                        if (this.lifecycleSagaTask.isCancelled()) {
                            return;
                        }
                        this.successTickCount++;
                        yield delay(tickIntervalInMillisecond);
                    }
                }
            }
        };
    }
}
