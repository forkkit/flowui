import NodeDetail from "./NodeDetail.jsx";
import React from 'react';
import {render} from 'react-dom';
import Controller from './controller.js';
import GraphTimeline from './GraphTimeline.jsx';
import FnClient from './fnclient.js';
import styles from './index.css';
import {HashRouter as Router, Route, Switch} from 'react-router-dom';
import MockCompleterClient from './mockcompleterclient.js';
import SpringyView from "./Springy.jsx";
import CompleterStreamClient from "./completerStreamClient";

require('file-loader?name=[name].[ext]!./index.html');

class App extends React.Component {

    constructor(props) {
        super(props);

        this.state = {
            loadOnNew: true,
            currentGraphId: null,
            currentNode: null,
            mode: 'timeline',
        };

        this.onGraphSelected = this.onGraphSelected.bind(this);
        this.renderCurrentGraph = this.renderCurrentGraph.bind(this);
        this.renderCurrentNode = this.renderCurrentNode.bind(this);
        this.onNodeSelected = this.onNodeSelected.bind(this);
        this.setMode = this.setMode.bind(this);
        this.loadNodeData = this.loadNodeData.bind(this);

        this.dollarsPerMs = 2.08e-9;
        const search = props.location.search;
        const params = new URLSearchParams(search);
        this.cost = params.get('cost');

        this.state.currentGraphId = null;

        if (props.match.path === '/mock') {
            this.client = new MockCompleterClient();
        } else {
            this.client = new CompleterStreamClient();
        }

        this.state.controller = new Controller(this.client, (c) => {
            this.state.controller = c;
            if (!this.state.currentGraphId && c.getKnownGraphs().length > 0
                && this.state.loadOnNew) {
                this.onGraphSelected(c.getKnownGraphs().slice(-1)[0].flow_id);
            } else {
                this.setState(this.state);
                this.loadNodeData();
            }

        });

        this.state.fnclient = new FnClient("/fn");

    }

    componentDidMount() {

    }

    componentWillUnmount() {
        this.client.close();
    }

    onGraphSelected(graphId) {
        this.state.currentGraphId = graphId;
        this.state.controller.subscribe(graphId);
        this.state.currentNode = null;
        this.watchedNodeState = new Map();

        this.setState(this.state);

    }

    renderCurrentGraph() {
        if (this.state.currentGraphId == null) {
            return (
                <div>
                    Select a graph or start running.
                </div>
            );
        }
        var activeGraphs = this.state.controller.getActiveGraphs();
        var graph = activeGraphs.get(this.state.currentGraphId);
        if (graph == null) {
            return (
                <div>
                    Graph loading...
                </div>
            );
        }

        if (this.state.mode === 'timeline') {
            return (
                <div>
                    <GraphTimeline graph={graph} height='800' onNodeSelected={this.onNodeSelected} dollarsPerMs={this.dollarsPerMs} cost={this.cost}/>
                </div>
            );

        } else {
            return (
                <div>
                    <SpringyView graph={graph} height='800' width='1024'
                                 onNodeSelected={this.onNodeSelected}/>
                </div>
            );

        }
    }

    renderCurrentNode() {
        if (this.state.currentNode == null) {
            return(<div></div>);
        }

        return (
            <NodeDetail node={this.state.currentNode} nodeLogs={this.state.nodeLogs}
                        nodeCalls={this.state.nodeCalls} dollarsPerMs={this.dollarsPerMs} cost={this.cost}/>

        );
    }

    loadCallLogs(node) {
        let index = node.function_id.indexOf("/");
        let appId = node.function_id.substring(0, index);
        this.state.fnclient.loadLogs(appId, node.call_id)
            .then((logs) => {
                if (logs !== "") {
                    this.state.nodeLogs.set(node, logs);
                    this.setState({nodeLogs: this.state.nodeLogs});
                }
            })
            .catch((e) => {
                console.log("error loading logs: " + e.message);
                throw e;
            });

        this.state.fnclient.loadCall(appId, node.call_id)
            .then((callInfo) => {
                this.state.nodeCalls.set(node, callInfo);
                this.setState({nodeCalls: this.state.nodeCalls});
            })
            .catch((e) => {
                console.log("error loading call: " + e.message);
                throw e;
            });
    }

    loadNodeData() {
        let currentNode = this.state.currentNode;
        if (currentNode !== null) {
            let deps = currentNode.transitiveDeps(true);
            deps.add(currentNode);
            deps.forEach(node => {
                             if (!this.state.nodeLogs.has(node)) {
                                 this.state.nodeLogs.set(node, null);
                             }
                             let lastState = this.watchedNodeState.get(node.id());
                             if (!lastState && node.isCompleted()) {
                                 this.watchedNodeState.set(node.id(), true);
                                 if (node.call_id) {
                                     this.loadCallLogs(node);
                                 }
                             }
                         }
            );
        }
    }

    onNodeSelected(graph, node) {
        this.state.currentNode = node;
        this.setState({currentNode: node});
        this.watchedNodeState = new Map();
        if ((node !== null)) {
            console.log(`node ${graph.flow_id}: ${node.stage_id} selected`);
            this.state.nodeLogs = new Map();
            this.state.nodeCalls = new Map();
            this.loadNodeData();
            //this.setState({nodeLogs: this.state.nodeLogs, nodeCalls: this.state.nodeCalls});
        }
    }

    setMode(mode) {
        this.setState({mode: mode});
    }

// Please note this currently only works for the first graph you create
    render() {
        let graphListItems = [];

        this.state.controller.getKnownGraphs().forEach((graph, index) => {
            const created = new Date(graph.graph_created.ts);
            let elem = (
                <li role="presentation" key={graph.flow_id} className={this.state.currentGraphId == graph.flow_id ? "active" : ""}>
                  <a href={"#" + this.props.location.pathname}
                     onClick={(e) => {
                         this.onGraphSelected(graph.flow_id);
                         e.stopPropagation();
                         e.nativeEvent.stopImmediatePropagation();
                    }}>
                    {graph.graph_created.function_id.split('/')[1]} <span className={styles.badge}>{created.toLocaleTimeString()}</span>
                  </a>
                </li>);
            graphListItems.push(elem);
        });

        return (
            <div className={`row ${styles.dark}`}>
              <div className={`col-sm-2 nav nav-pills nav-stacked ${styles.master}`}>
                <h2 className={styles.navHeader}>Flows <span>{graphListItems.length}</span></h2>
                    {graphListItems}
              </div>
              <div className={`col-sm-10 ${styles.detail}`}>
                  {this.renderCurrentGraph()}
                  {this.renderCurrentNode()}
              </div>
            </div>
        );
    }
}

render((<Router>
    <div>
        <Switch>
            <Route exact path="/" component={App}/>
            <Route path="/mock" component={App}/>
        </Switch>
    </div>
</Router>), document.getElementById('app'));
