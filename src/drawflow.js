/**
 * Drawflow 主类，负责流程图编辑器的所有核心逻辑
 */
export default class Drawflow {
  /**
   * 构造函数，初始化编辑器
   * @param {HTMLElement} container - 画布容器
   * @param {Object} render - 渲染相关（可选，支持Vue等）
   * @param {Object} parent - 父级（可选）
   */
  constructor(container, render = null, parent = null) {
    this.events = {}; // 事件监听器集合
    this.container = container; // 画布容器
    this.precanvas = null; // 实际画布（内部div）
    this.nodeId = 1; // 节点自增ID
    this.ele_selected = null; // 当前选中的元素
    this.node_selected = null; // 当前选中的节点
    this.drag = false; // 是否正在拖动节点
    this.reroute = false; // 是否允许中间点拖动
    this.reroute_fix_curvature = false; // 是否固定中间点曲率
    this.curvature = 0.5; // 连线曲率
    this.reroute_curvature_start_end = 0.5; // 中间点起止曲率
    this.reroute_curvature = 0.5; // 中间点曲率
    this.reroute_width = 6; // 中间点圆圈半径
    this.drag_point = false; // 是否正在拖动中间点
    this.editor_selected = false; // 是否选中编辑器（用于平移画布）
    this.connection = false; // 是否正在连线
    this.connection_ele = null; // 当前正在绘制的连线SVG元素
    this.connection_selected = null; // 当前选中的连线
    this.canvas_x = 0; // 画布x偏移
    this.canvas_y = 0; // 画布y偏移
    this.pos_x = 0; // 鼠标x坐标
    this.pos_x_start = 0; // 鼠标x起始坐标
    this.pos_y = 0; // 鼠标y坐标
    this.pos_y_start = 0; // 鼠标y起始坐标
    this.mouse_x = 0; // 鼠标当前x
    this.mouse_y = 0; // 鼠标当前y
    this.line_path = 5; // 连线路径宽度
    this.first_click = null; // 第一次点击的元素
    this.force_first_input = false; // 是否强制第一个输入
    this.draggable_inputs = true; // 输入端口是否可拖动
    this.useuuid = false; // 是否使用uuid作为节点ID
    this.parent = parent; // 父级（用于Vue等）

    this.noderegister = {}; // 节点注册表（自定义节点）
    this.render = render; // 渲染相关
    this.drawflow = { "drawflow": { "Home": { "data": {} }}}; // 主数据结构
    // 可配置选项
    this.module = 'Home'; // 当前模块
    this.editor_mode = 'edit'; // 编辑器模式（edit/fixed/view）
    this.zoom = 1; // 当前缩放比例
    this.zoom_max = 1.6; // 最大缩放
    this.zoom_min = 0.5; // 最小缩放
    this.zoom_value = 0.1; // 每次缩放步长
    this.zoom_last_value = 1; // 上一次缩放值

    // 移动端缩放相关
    this.evCache = new Array(); // 触摸事件缓存
    this.prevDiff = -1; // 上一次两指距离
  }

  /**
   * 启动编辑器，初始化DOM和事件
   */
  start () {
    // console.info("Start Drawflow!!");
    this.container.classList.add("parent-drawflow");
    this.container.tabIndex = 0;
    this.precanvas = document.createElement('div');
    this.precanvas.classList.add("drawflow");
    this.container.appendChild(this.precanvas);

    /* Mouse and Touch Actions */
    this.container.addEventListener('mouseup', this.dragEnd.bind(this));
    this.container.addEventListener('mousemove', this.position.bind(this));
    this.container.addEventListener('mousedown', this.click.bind(this) );

    this.container.addEventListener('touchend', this.dragEnd.bind(this));
    this.container.addEventListener('touchmove', this.position.bind(this));
    this.container.addEventListener('touchstart', this.click.bind(this));

    /* Context Menu */
    this.container.addEventListener('contextmenu', this.contextmenu.bind(this));
    /* Delete */
    this.container.addEventListener('keydown', this.key.bind(this));

    /* Zoom Mouse */
    this.container.addEventListener('wheel', this.zoom_enter.bind(this));
    /* Update data Nodes */
    this.container.addEventListener('input', this.updateNodeValue.bind(this));

    this.container.addEventListener('dblclick', this.dblclick.bind(this));
    /* Mobile zoom */
    this.container.onpointerdown = this.pointerdown_handler.bind(this);
    this.container.onpointermove = this.pointermove_handler.bind(this);
    this.container.onpointerup = this.pointerup_handler.bind(this);
    this.container.onpointercancel = this.pointerup_handler.bind(this);
    this.container.onpointerout = this.pointerup_handler.bind(this);
    this.container.onpointerleave = this.pointerup_handler.bind(this);

    this.load();
  }

  /* Mobile zoom */
  /**
   * 移动端缩放：指针按下
   */
  pointerdown_handler(ev) {
   this.evCache.push(ev);
  }

  /**
   * 移动端缩放：指针移动
   */
  pointermove_handler(ev) {
   for (var i = 0; i < this.evCache.length; i++) {
     if (ev.pointerId == this.evCache[i].pointerId) {
        this.evCache[i] = ev;
     break;
     }
   }

   if (this.evCache.length == 2) {
     // Calculate the distance between the two pointers
     var curDiff = Math.abs(this.evCache[0].clientX - this.evCache[1].clientX);

     if (this.prevDiff > 100) {
       if (curDiff > this.prevDiff) {
         // The distance between the two pointers has increased

         this.zoom_in();
       }
       if (curDiff < this.prevDiff) {
         // The distance between the two pointers has decreased
         this.zoom_out();
       }
     }
     this.prevDiff = curDiff;
   }
  }

  /**
   * 移动端缩放：指针抬起
   */
  pointerup_handler(ev) {
    this.remove_event(ev);
    if (this.evCache.length < 2) {
      this.prevDiff = -1;
    }
  }
  remove_event(ev) {
   // Remove this event from the target's cache
   for (var i = 0; i < this.evCache.length; i++) {
     if (this.evCache[i].pointerId == ev.pointerId) {
       this.evCache.splice(i, 1);
       break;
     }
   }
  }
  /* End Mobile Zoom */
  /**
   * 加载流程数据，渲染所有节点和连线
   */
  load() {
    for (var key in this.drawflow.drawflow[this.module].data) {
      this.addNodeImport(this.drawflow.drawflow[this.module].data[key], this.precanvas);
    }

    if(this.reroute) {
      for (var key in this.drawflow.drawflow[this.module].data) {
        this.addRerouteImport(this.drawflow.drawflow[this.module].data[key]);
      }
    }

    for (var key in this.drawflow.drawflow[this.module].data) {
      this.updateConnectionNodes('node-'+key);
    }

    const editor = this.drawflow.drawflow;
    let number = 1;
    Object.keys(editor).map(function(moduleName, index) {
      Object.keys(editor[moduleName].data).map(function(id, index2) {
        if(parseInt(id) >= number) {
          number = parseInt(id)+1;
        }
      });
    });
    this.nodeId = number;
  }

  removeReouteConnectionSelected(){
    this.dispatch('connectionUnselected', true);
    if(this.reroute_fix_curvature) {
      this.connection_selected.parentElement.querySelectorAll(".main-path").forEach((item, i) => {
        item.classList.remove("selected");
      });
    }
  }

  /**
   * 处理节点/连线的选中、拖动、连线等鼠标事件
   */
  click(e) {
    this.dispatch('click', e);
    if(this.editor_mode === 'fixed') {
      //return false;
       if(e.target.classList[0] === 'parent-drawflow' || e.target.classList[0] === 'drawflow') {
         this.ele_selected = e.target.closest(".parent-drawflow");
         e.preventDefault();
       } else {
         return false;
       }
    } else if(this.editor_mode === 'view') {
      if(e.target.closest(".drawflow") != null || e.target.matches('.parent-drawflow')) {
        this.ele_selected = e.target.closest(".parent-drawflow");
        e.preventDefault();
      }
    } else {
      this.first_click = e.target;
      this.ele_selected = e.target;
      if(e.button === 0) {
        this.contextmenuDel();
      }

      if(e.target.closest(".drawflow_content_node") != null) {
        this.ele_selected = e.target.closest(".drawflow_content_node").parentElement;
      }
    }
    switch (this.ele_selected.classList[0]) {
      case 'drawflow-node':
        if(this.node_selected != null) {
          this.node_selected.classList.remove("selected");
          if(this.node_selected != this.ele_selected) {
            this.dispatch('nodeUnselected', true);
          }
        }
        if(this.connection_selected != null) {
          this.connection_selected.classList.remove("selected");
          this.removeReouteConnectionSelected();
          this.connection_selected = null;
        }
        if(this.node_selected != this.ele_selected) {
          this.dispatch('nodeSelected', this.ele_selected.id.slice(5));
        }
        this.node_selected = this.ele_selected;
        this.node_selected.classList.add("selected");
        if(!this.draggable_inputs) {
          if(e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT' && e.target.hasAttribute('contenteditable') !== true) {
            this.drag = true;
          }
        } else {
          if(e.target.tagName !== 'SELECT') {
            this.drag = true;
          }
        }
        break;
      case 'output':
        this.connection = true;
        if(this.node_selected != null) {
          this.node_selected.classList.remove("selected");
          this.node_selected = null;
          this.dispatch('nodeUnselected', true);
        }
        if(this.connection_selected != null) {
          this.connection_selected.classList.remove("selected");
          this.removeReouteConnectionSelected();
          this.connection_selected = null;
        }
        this.drawConnection(e.target);
        break;
      case 'parent-drawflow':
        if(this.node_selected != null) {
          this.node_selected.classList.remove("selected");
          this.node_selected = null;
          this.dispatch('nodeUnselected', true);
        }
        if(this.connection_selected != null) {
          this.connection_selected.classList.remove("selected");
          this.removeReouteConnectionSelected();
          this.connection_selected = null;
        }
        this.editor_selected = true;
        break;
      case 'drawflow':
        if(this.node_selected != null) {
          this.node_selected.classList.remove("selected");
          this.node_selected = null;
          this.dispatch('nodeUnselected', true);
        }
        if(this.connection_selected != null) {
          this.connection_selected.classList.remove("selected");
          this.removeReouteConnectionSelected();
          this.connection_selected = null;
        }
        this.editor_selected = true;
        break;
      case 'main-path':
        if(this.node_selected != null) {
          this.node_selected.classList.remove("selected");
          this.node_selected = null;
          this.dispatch('nodeUnselected', true);
        }
        if(this.connection_selected != null) {
          this.connection_selected.classList.remove("selected");
          this.removeReouteConnectionSelected();
          this.connection_selected = null;
        }
        this.connection_selected = this.ele_selected;
        this.connection_selected.classList.add("selected");
        const listclassConnection = this.connection_selected.parentElement.classList;
        if(listclassConnection.length > 1){
          this.dispatch('connectionSelected', { output_id: listclassConnection[2].slice(14), input_id: listclassConnection[1].slice(13), output_class: listclassConnection[3], input_class: listclassConnection[4] });
          if(this.reroute_fix_curvature) {
            this.connection_selected.parentElement.querySelectorAll(".main-path").forEach((item, i) => {
              item.classList.add("selected");
            });
          }
        }
      break;
      case 'point':
        this.drag_point = true;
        this.ele_selected.classList.add("selected");
      break;
      case 'drawflow-delete':
        if(this.node_selected ) {
          this.removeNodeId(this.node_selected.id);
        }

        if(this.connection_selected) {
          this.removeConnection();
        }

        if(this.node_selected != null) {
          this.node_selected.classList.remove("selected");
          this.node_selected = null;
          this.dispatch('nodeUnselected', true);
        }
        if(this.connection_selected != null) {
          this.connection_selected.classList.remove("selected");
          this.removeReouteConnectionSelected();
          this.connection_selected = null;
        }

      break;
      default:
    }
    if (e.type === "touchstart") {
      this.pos_x = e.touches[0].clientX;
      this.pos_x_start = e.touches[0].clientX;
      this.pos_y = e.touches[0].clientY;
      this.pos_y_start = e.touches[0].clientY;
      this.mouse_x = e.touches[0].clientX;
      this.mouse_y = e.touches[0].clientY;
    } else {
      this.pos_x = e.clientX;
      this.pos_x_start = e.clientX;
      this.pos_y = e.clientY;
      this.pos_y_start = e.clientY;
    }
    if (['input','output','main-path'].includes(this.ele_selected.classList[0])) {
      e.preventDefault();
    }
    this.dispatch('clickEnd', e);
  }

  /**
   * 鼠标移动事件，处理节点拖动、连线拖动、画布平移等
   */
  position(e) {
    if (e.type === "touchmove") {
      var e_pos_x = e.touches[0].clientX;
      var e_pos_y = e.touches[0].clientY;
    } else {
      var e_pos_x = e.clientX;
      var e_pos_y = e.clientY;
    }


    if(this.connection) {
      this.updateConnection(e_pos_x, e_pos_y);
    }
    if(this.editor_selected) {
      x =  this.canvas_x + (-(this.pos_x - e_pos_x))
      y = this.canvas_y + (-(this.pos_y - e_pos_y))
      this.dispatch('translate', { x: x, y: y});
      this.precanvas.style.transform = "translate("+x+"px, "+y+"px) scale("+this.zoom+")";
    }
    if(this.drag) {
      e.preventDefault();
      var x = (this.pos_x - e_pos_x) * this.precanvas.clientWidth / (this.precanvas.clientWidth * this.zoom);
      var y = (this.pos_y - e_pos_y) * this.precanvas.clientHeight / (this.precanvas.clientHeight * this.zoom);
      this.pos_x = e_pos_x;
      this.pos_y = e_pos_y;

      this.ele_selected.style.top = (this.ele_selected.offsetTop - y) + "px";
      this.ele_selected.style.left = (this.ele_selected.offsetLeft - x) + "px";

      this.drawflow.drawflow[this.module].data[this.ele_selected.id.slice(5)].pos_x = (this.ele_selected.offsetLeft - x);
      this.drawflow.drawflow[this.module].data[this.ele_selected.id.slice(5)].pos_y = (this.ele_selected.offsetTop - y);

      this.updateConnectionNodes(this.ele_selected.id)
    }

    if(this.drag_point) {

      var x = (this.pos_x - e_pos_x) * this.precanvas.clientWidth / (this.precanvas.clientWidth * this.zoom);
      var y = (this.pos_y - e_pos_y) * this.precanvas.clientHeight / (this.precanvas.clientHeight * this.zoom);
      this.pos_x = e_pos_x;
      this.pos_y = e_pos_y;

      var pos_x = this.pos_x * ( this.precanvas.clientWidth / (this.precanvas.clientWidth * this.zoom)) - (this.precanvas.getBoundingClientRect().x * ( this.precanvas.clientWidth / (this.precanvas.clientWidth * this.zoom)));
      var pos_y = this.pos_y * ( this.precanvas.clientHeight / (this.precanvas.clientHeight * this.zoom)) - (this.precanvas.getBoundingClientRect().y * ( this.precanvas.clientHeight / (this.precanvas.clientHeight * this.zoom)));

      this.ele_selected.setAttributeNS(null, 'cx', pos_x);
      this.ele_selected.setAttributeNS(null, 'cy', pos_y);

      const nodeUpdate = this.ele_selected.parentElement.classList[2].slice(9);
      const nodeUpdateIn = this.ele_selected.parentElement.classList[1].slice(13);
      const output_class = this.ele_selected.parentElement.classList[3];
      const input_class = this.ele_selected.parentElement.classList[4];

      let numberPointPosition = Array.from(this.ele_selected.parentElement.children).indexOf(this.ele_selected)-1;

      if(this.reroute_fix_curvature) {
        const numberMainPath = this.ele_selected.parentElement.querySelectorAll(".main-path").length-1;
        numberPointPosition -= numberMainPath;
        if(numberPointPosition < 0) {
          numberPointPosition = 0;
        }
      }

      const nodeId = nodeUpdate.slice(5);
      const searchConnection = this.drawflow.drawflow[this.module].data[nodeId].outputs[output_class].connections.findIndex(function(item,i) {
        return item.node ===  nodeUpdateIn && item.output === input_class;
      });

      this.drawflow.drawflow[this.module].data[nodeId].outputs[output_class].connections[searchConnection].points[numberPointPosition] = { pos_x: pos_x, pos_y: pos_y };

      const parentSelected = this.ele_selected.parentElement.classList[2].slice(9);

      this.updateConnectionNodes(parentSelected);
    }

    if (e.type === "touchmove") {
      this.mouse_x = e_pos_x;
      this.mouse_y = e_pos_y;
    }
    this.dispatch('mouseMove', {x: e_pos_x,y: e_pos_y });
  }

  /**
   * 鼠标释放事件，结束拖动、连线等操作
   */
  dragEnd(e) {
    if (e.type === "touchend") {
      var e_pos_x = this.mouse_x;
      var e_pos_y = this.mouse_y;
      var ele_last = document.elementFromPoint(e_pos_x, e_pos_y);
    } else {
      var e_pos_x = e.clientX;
      var e_pos_y = e.clientY;
      var ele_last = e.target;
    }

    if(this.drag) {
      if(this.pos_x_start != e_pos_x || this.pos_y_start != e_pos_y) {
        this.dispatch('nodeMoved', this.ele_selected.id.slice(5));
      }
    }

    if(this.drag_point) {
      this.ele_selected.classList.remove("selected");
        if(this.pos_x_start != e_pos_x || this.pos_y_start != e_pos_y) {
          this.dispatch('rerouteMoved', this.ele_selected.parentElement.classList[2].slice(14));
        }
    }

    if(this.editor_selected) {
      this.canvas_x = this.canvas_x + (-(this.pos_x - e_pos_x));
      this.canvas_y = this.canvas_y + (-(this.pos_y - e_pos_y));
      this.editor_selected = false;
    }
    if(this.connection === true) {
      if(ele_last.classList[0] === 'input' || (this.force_first_input && (ele_last.closest(".drawflow_content_node") != null || ele_last.classList[0] === 'drawflow-node'))) {

        if(this.force_first_input && (ele_last.closest(".drawflow_content_node") != null || ele_last.classList[0] === 'drawflow-node')) {
          if(ele_last.closest(".drawflow_content_node") != null) {
            var input_id = ele_last.closest(".drawflow_content_node").parentElement.id;
          } else {
            var input_id = ele_last.id;
          }
         if(Object.keys(this.getNodeFromId(input_id.slice(5)).inputs).length === 0) {
           var input_class = false;
         } else {
          var input_class = "input_1";
         }


       } else {
         // Fix connection;
         var input_id = ele_last.parentElement.parentElement.id;
         var input_class = ele_last.classList[1];
       }
       var output_id = this.ele_selected.parentElement.parentElement.id;
       var output_class = this.ele_selected.classList[1];

        if(output_id !== input_id && input_class !== false) {

          if(this.container.querySelectorAll('.connection.node_in_'+input_id+'.node_out_'+output_id+'.'+output_class+'.'+input_class).length === 0) {
          // Conection no exist save connection

          this.connection_ele.classList.add("node_in_"+input_id);
          this.connection_ele.classList.add("node_out_"+output_id);
          this.connection_ele.classList.add(output_class);
          this.connection_ele.classList.add(input_class);
          var id_input = input_id.slice(5);
          var id_output = output_id.slice(5);

          this.drawflow.drawflow[this.module].data[id_output].outputs[output_class].connections.push( {"node": id_input, "output": input_class});
          this.drawflow.drawflow[this.module].data[id_input].inputs[input_class].connections.push( {"node": id_output, "input": output_class});
          this.updateConnectionNodes('node-'+id_output);
          this.updateConnectionNodes('node-'+id_input);
          this.dispatch('connectionCreated', { output_id: id_output, input_id: id_input, output_class:  output_class, input_class: input_class});

        } else {
          this.dispatch('connectionCancel', true);
          this.connection_ele.remove();
        }

          this.connection_ele = null;
      } else {
        // Connection exists Remove Connection;
        this.dispatch('connectionCancel', true);
        this.connection_ele.remove();
        this.connection_ele = null;
      }

      } else {
        // Remove Connection;
        this.dispatch('connectionCancel', true);
        this.connection_ele.remove();
        this.connection_ele = null;
      }
    }

    this.drag = false;
    this.drag_point = false;
    this.connection = false;
    this.ele_selected = null;
    this.editor_selected = false;

    this.dispatch('mouseUp', e);
  }
  /**
   * 右键菜单事件
   */
  contextmenu(e) {
    this.dispatch('contextmenu', e);
    e.preventDefault();
    if(this.editor_mode === 'fixed' || this.editor_mode === 'view') {
      return false;
    }
    if(this.precanvas.getElementsByClassName("drawflow-delete").length) {
      this.precanvas.getElementsByClassName("drawflow-delete")[0].remove()
    };
    if(this.node_selected || this.connection_selected) {
      var deletebox = document.createElement('div');
      deletebox.classList.add("drawflow-delete");
      deletebox.innerHTML = "x";
      if(this.node_selected) {
        this.node_selected.appendChild(deletebox);

      }
      if(this.connection_selected && (this.connection_selected.parentElement.classList.length > 1)) {
        deletebox.style.top = e.clientY * ( this.precanvas.clientHeight / (this.precanvas.clientHeight * this.zoom)) - (this.precanvas.getBoundingClientRect().y *  ( this.precanvas.clientHeight / (this.precanvas.clientHeight * this.zoom)) ) + "px";
        deletebox.style.left = e.clientX * ( this.precanvas.clientWidth / (this.precanvas.clientWidth * this.zoom)) - (this.precanvas.getBoundingClientRect().x *  ( this.precanvas.clientWidth / (this.precanvas.clientWidth * this.zoom)) ) + "px";

        this.precanvas.appendChild(deletebox);

      }

    }

  }
  /**
   * 删除右键菜单
   */
  contextmenuDel() {
    if(this.precanvas.getElementsByClassName("drawflow-delete").length) {
      this.precanvas.getElementsByClassName("drawflow-delete")[0].remove()
    };
  }

  /**
   * 键盘事件，处理删除节点/连线
   */
  key(e) {
    this.dispatch('keydown', e);
    if(this.editor_mode === 'fixed' || this.editor_mode === 'view') {
      return false;
    }
    if (e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey)) {
      if(this.node_selected != null) {
        if(this.first_click.tagName !== 'INPUT' && this.first_click.tagName !== 'TEXTAREA' && this.first_click.hasAttribute('contenteditable') !== true) {
          this.removeNodeId(this.node_selected.id);
        }
      }
      if(this.connection_selected != null) {
        this.removeConnection();
      }
    }
  }

  /**
   * 鼠标滚轮缩放事件
   */
  zoom_enter(event, delta) {
    if (event.ctrlKey) {
      event.preventDefault()
      if(event.deltaY > 0) {
        // Zoom Out
        this.zoom_out();
      } else {
        // Zoom In
        this.zoom_in();
      }
    }
  }
  /**
   * 刷新缩放
   */
  zoom_refresh(){
    this.dispatch('zoom', this.zoom);
    this.canvas_x = (this.canvas_x / this.zoom_last_value) * this.zoom;
    this.canvas_y = (this.canvas_y / this.zoom_last_value) * this.zoom;
    this.zoom_last_value = this.zoom;
    this.precanvas.style.transform = "translate("+this.canvas_x+"px, "+this.canvas_y+"px) scale("+this.zoom+")";
  }
  /**
   * 放大
   */
  zoom_in() {
    if(this.zoom < this.zoom_max) {
        this.zoom+=this.zoom_value;
        this.zoom_refresh();
    }
  }
  /**
   * 缩小
   */
  zoom_out() {
    if(this.zoom > this.zoom_min) {
      this.zoom-=this.zoom_value;
        this.zoom_refresh();
    }
  }
  /**
   * 重置缩放
   */
  zoom_reset(){
    if(this.zoom != 1) {
      this.zoom = 1;
      this.zoom_refresh();
    }
  }

  /**
   * 生成贝塞尔曲线路径（连线用）
   */
  createCurvature(start_pos_x, start_pos_y, end_pos_x, end_pos_y, curvature_value, type) {
    var line_x = start_pos_x;
    var line_y = start_pos_y;
    var x = end_pos_x;
    var y = end_pos_y;
    var curvature = curvature_value;
    //type openclose open close other
    switch (type) {
      case 'open':
        if(start_pos_x >= end_pos_x) {
          var hx1 = line_x + Math.abs(x - line_x) * curvature;
          var hx2 = x - Math.abs(x - line_x) * (curvature*-1);
        } else {
          var hx1 = line_x + Math.abs(x - line_x) * curvature;
          var hx2 = x - Math.abs(x - line_x) * curvature;
        }
        return ' M '+ line_x +' '+ line_y +' C '+ hx1 +' '+ line_y +' '+ hx2 +' ' + y +' ' + x +'  ' + y;

        break
      case 'close':
        if(start_pos_x >= end_pos_x) {
          var hx1 = line_x + Math.abs(x - line_x) * (curvature*-1);
          var hx2 = x - Math.abs(x - line_x) * curvature;
        } else {
          var hx1 = line_x + Math.abs(x - line_x) * curvature;
          var hx2 = x - Math.abs(x - line_x) * curvature;
        }
        return ' M '+ line_x +' '+ line_y +' C '+ hx1 +' '+ line_y +' '+ hx2 +' ' + y +' ' + x +'  ' + y;
        break;
      case 'other':
        if(start_pos_x >= end_pos_x) {
          var hx1 = line_x + Math.abs(x - line_x) * (curvature*-1);
          var hx2 = x - Math.abs(x - line_x) * (curvature*-1);
        } else {
          var hx1 = line_x + Math.abs(x - line_x) * curvature;
          var hx2 = x - Math.abs(x - line_x) * curvature;
        }
        return ' M '+ line_x +' '+ line_y +' C '+ hx1 +' '+ line_y +' '+ hx2 +' ' + y +' ' + x +'  ' + y;
        break;
      default:

        var hx1 = line_x + Math.abs(x - line_x) * curvature;
        var hx2 = x - Math.abs(x - line_x) * curvature;

        return ' M '+ line_x +' '+ line_y +' C '+ hx1 +' '+ line_y +' '+ hx2 +' ' + y +' ' + x +'  ' + y;
    }

  }

  /**
   * 开始绘制连线（鼠标按下输出端口时）
   */
  drawConnection(ele) {
    var connection = document.createElementNS('http://www.w3.org/2000/svg',"svg");
    this.connection_ele = connection;
    var path = document.createElementNS('http://www.w3.org/2000/svg',"path");
    path.classList.add("main-path");
    path.setAttributeNS(null, 'd', '');
    // path.innerHTML = 'a';
    connection.classList.add("connection");
    connection.appendChild(path);
    this.precanvas.appendChild(connection);
    var id_output = ele.parentElement.parentElement.id.slice(5);
    var output_class = ele.classList[1];
    this.dispatch('connectionStart', { output_id: id_output, output_class:  output_class });

  }

  /**
   * 连线跟随鼠标移动
   */
  updateConnection(eX, eY) {
    const precanvas = this.precanvas;
    const zoom = this.zoom;
    let precanvasWitdhZoom = precanvas.clientWidth / (precanvas.clientWidth * zoom);
    precanvasWitdhZoom = precanvasWitdhZoom || 0;
    let precanvasHeightZoom = precanvas.clientHeight / (precanvas.clientHeight * zoom);
    precanvasHeightZoom = precanvasHeightZoom || 0;
    var path = this.connection_ele.children[0];

    var line_x = this.ele_selected.offsetWidth/2 + (this.ele_selected.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom;
    var line_y = this.ele_selected.offsetHeight/2 + (this.ele_selected.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom;

    var x = eX * ( this.precanvas.clientWidth / (this.precanvas.clientWidth * this.zoom)) - (this.precanvas.getBoundingClientRect().x *  ( this.precanvas.clientWidth / (this.precanvas.clientWidth * this.zoom)) );
    var y = eY * ( this.precanvas.clientHeight / (this.precanvas.clientHeight * this.zoom)) - (this.precanvas.getBoundingClientRect().y *  ( this.precanvas.clientHeight / (this.precanvas.clientHeight * this.zoom)) );

    var curvature = this.curvature;
    var lineCurve = this.createCurvature(line_x, line_y, x, y, curvature, 'openclose');
    path.setAttributeNS(null, 'd', lineCurve);

  }

  /**
   * 添加连线（数据和SVG）
   */
  addConnection(id_output, id_input, output_class, input_class) {
    var nodeOneModule = this.getModuleFromNodeId(id_output);
    var nodeTwoModule = this.getModuleFromNodeId(id_input);
    if(nodeOneModule === nodeTwoModule) {

      var dataNode = this.getNodeFromId(id_output);
      var exist = false;
      for(var checkOutput in dataNode.outputs[output_class].connections){
        var connectionSearch = dataNode.outputs[output_class].connections[checkOutput]
        if(connectionSearch.node == id_input && connectionSearch.output == input_class) {
            exist = true;
        }
      }
      // Check connection exist
      if(exist === false) {
        //Create Connection
        this.drawflow.drawflow[nodeOneModule].data[id_output].outputs[output_class].connections.push( {"node": id_input.toString(), "output": input_class});
        this.drawflow.drawflow[nodeOneModule].data[id_input].inputs[input_class].connections.push( {"node": id_output.toString(), "input": output_class});

        if(this.module === nodeOneModule) {
        //Draw connection
          var connection = document.createElementNS('http://www.w3.org/2000/svg',"svg");
          var path = document.createElementNS('http://www.w3.org/2000/svg',"path");
          path.classList.add("main-path");
          path.setAttributeNS(null, 'd', '');
          // path.innerHTML = 'a';
          connection.classList.add("connection");
          connection.classList.add("node_in_node-"+id_input);
          connection.classList.add("node_out_node-"+id_output);
          connection.classList.add(output_class);
          connection.classList.add(input_class);
          connection.appendChild(path);
          this.precanvas.appendChild(connection);
          this.updateConnectionNodes('node-'+id_output);
          this.updateConnectionNodes('node-'+id_input);
        }

        this.dispatch('connectionCreated', { output_id: id_output, input_id: id_input, output_class:  output_class, input_class: input_class});
      }
    }
  }

  /**
   * 更新指定节点相关的所有连线
   */
  updateConnectionNodes(id) {

    // Aquí nos quedamos;
    const idSearch = 'node_in_'+id;
    const idSearchOut = 'node_out_'+id;
    var line_path = this.line_path/2;
    const container = this.container;
    const precanvas = this.precanvas;
    const curvature = this.curvature;
    const createCurvature = this.createCurvature;
    const reroute_curvature = this.reroute_curvature;
    const reroute_curvature_start_end = this.reroute_curvature_start_end;
    const reroute_fix_curvature = this.reroute_fix_curvature;
    const rerouteWidth = this.reroute_width;
    const zoom = this.zoom;
    let precanvasWitdhZoom = precanvas.clientWidth / (precanvas.clientWidth * zoom);
    precanvasWitdhZoom = precanvasWitdhZoom || 0;
    let precanvasHeightZoom = precanvas.clientHeight / (precanvas.clientHeight * zoom);
    precanvasHeightZoom = precanvasHeightZoom || 0;

    const elemsOut = container.querySelectorAll(`.${idSearchOut}`);

    Object.keys(elemsOut).map(function(item, index) {
      if(elemsOut[item].querySelector('.point') === null) {

        var elemtsearchId_out = container.querySelector(`#${id}`);

        var id_search = elemsOut[item].classList[1].replace('node_in_', '');
        var elemtsearchId = container.querySelector(`#${id_search}`);

        var elemtsearch = elemtsearchId.querySelectorAll('.'+elemsOut[item].classList[4])[0]

        var eX = elemtsearch.offsetWidth/2 + (elemtsearch.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom;
        var eY = elemtsearch.offsetHeight/2 + (elemtsearch.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom;

        var elemtsearchOut = elemtsearchId_out.querySelectorAll('.'+elemsOut[item].classList[3])[0]

        var line_x =  elemtsearchOut.offsetWidth/2 + (elemtsearchOut.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom;
        var line_y =  elemtsearchOut.offsetHeight/2 + (elemtsearchOut.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom;

        var x = eX;
        var y = eY;

        const lineCurve = createCurvature(line_x, line_y, x, y, curvature, 'openclose');
        elemsOut[item].children[0].setAttributeNS(null, 'd', lineCurve );
      } else {
        const points = elemsOut[item].querySelectorAll('.point');
        let linecurve = '';
        const reoute_fix = [];
        points.forEach((item, i) => {
          if(i === 0 && ((points.length -1) === 0)) {

            var elemtsearchId_out = container.querySelector(`#${id}`);
            var elemtsearch = item;

            var eX =  (elemtsearch.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom + rerouteWidth;
            var eY =  (elemtsearch.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom + rerouteWidth;

            var elemtsearchOut = elemtsearchId_out.querySelectorAll('.'+item.parentElement.classList[3])[0]
            var line_x =  elemtsearchOut.offsetWidth/2 + (elemtsearchOut.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom;
            var line_y =  elemtsearchOut.offsetHeight/2 + (elemtsearchOut.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom;
            var x = eX;
            var y = eY;

            var lineCurveSearch = createCurvature(line_x, line_y, x, y, reroute_curvature_start_end, 'open');
            linecurve += lineCurveSearch;
            reoute_fix.push(lineCurveSearch);

            var elemtsearchId_out = item;
            var id_search = item.parentElement.classList[1].replace('node_in_', '');
            var elemtsearchId = container.querySelector(`#${id_search}`);
            var elemtsearch = elemtsearchId.querySelectorAll('.'+item.parentElement.classList[4])[0]

            var elemtsearchIn = elemtsearchId.querySelectorAll('.'+item.parentElement.classList[4])[0]
            var eX =  elemtsearchIn.offsetWidth/2 + (elemtsearchIn.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom;
            var eY =  elemtsearchIn.offsetHeight/2 + (elemtsearchIn.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom;


            var line_x = (elemtsearchId_out.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom + rerouteWidth;
            var line_y = (elemtsearchId_out.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom + rerouteWidth;
            var x = eX;
            var y = eY;

            var lineCurveSearch = createCurvature(line_x, line_y, x, y, reroute_curvature_start_end, 'close');
            linecurve += lineCurveSearch;
            reoute_fix.push(lineCurveSearch);

          } else if(i === 0) {

            var elemtsearchId_out = container.querySelector(`#${id}`);
            var elemtsearch = item;

            var eX = (elemtsearch.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom + rerouteWidth;
            var eY = (elemtsearch.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom + rerouteWidth;

            var elemtsearchOut = elemtsearchId_out.querySelectorAll('.'+item.parentElement.classList[3])[0]
            var line_x =  elemtsearchOut.offsetWidth/2 + (elemtsearchOut.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom;
            var line_y =  elemtsearchOut.offsetHeight/2 + (elemtsearchOut.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom;

            var x = eX;
            var y = eY;

            var lineCurveSearch = createCurvature(line_x, line_y, x, y, reroute_curvature_start_end, 'open');
            linecurve += lineCurveSearch;
            reoute_fix.push(lineCurveSearch);

            // SECOND
            var elemtsearchId_out = item;
            var elemtsearch = points[i+1];

            var eX = (elemtsearch.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom + rerouteWidth;
            var eY = (elemtsearch.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom + rerouteWidth;
            var line_x = (elemtsearchId_out.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom + rerouteWidth;
            var line_y = (elemtsearchId_out.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom + rerouteWidth;
            var x = eX;
            var y = eY;

            var lineCurveSearch = createCurvature(line_x, line_y, x, y, reroute_curvature, 'other');
            linecurve += lineCurveSearch;
            reoute_fix.push(lineCurveSearch);

          } else if (i === (points.length -1)) {

            var elemtsearchId_out = item;

            var id_search = item.parentElement.classList[1].replace('node_in_', '');
            var elemtsearchId = container.querySelector(`#${id_search}`);
            var elemtsearch = elemtsearchId.querySelectorAll('.'+item.parentElement.classList[4])[0]

            var elemtsearchIn = elemtsearchId.querySelectorAll('.'+item.parentElement.classList[4])[0]
            var eX =  elemtsearchIn.offsetWidth/2 + (elemtsearchIn.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom;
            var eY =  elemtsearchIn.offsetHeight/2 + (elemtsearchIn.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom;
            var line_x = (elemtsearchId_out.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * (precanvas.clientWidth / (precanvas.clientWidth * zoom)) + rerouteWidth;
            var line_y = (elemtsearchId_out.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * (precanvas.clientHeight / (precanvas.clientHeight * zoom)) + rerouteWidth;
            var x = eX;
            var y = eY;

            var lineCurveSearch = createCurvature(line_x, line_y, x, y, reroute_curvature_start_end, 'close');
            linecurve += lineCurveSearch;
            reoute_fix.push(lineCurveSearch);

          } else {
            var elemtsearchId_out = item;
            var elemtsearch = points[i+1];

            var eX = (elemtsearch.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * (precanvas.clientWidth / (precanvas.clientWidth * zoom)) + rerouteWidth;
            var eY = (elemtsearch.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * (precanvas.clientHeight / (precanvas.clientHeight * zoom)) +rerouteWidth;
            var line_x = (elemtsearchId_out.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * (precanvas.clientWidth / (precanvas.clientWidth * zoom)) + rerouteWidth;
            var line_y = (elemtsearchId_out.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * (precanvas.clientHeight / (precanvas.clientHeight * zoom)) + rerouteWidth;
            var x = eX;
            var y = eY;

            var lineCurveSearch = createCurvature(line_x, line_y, x, y, reroute_curvature, 'other');
            linecurve += lineCurveSearch;
            reoute_fix.push(lineCurveSearch);
          }

        });
        if(reroute_fix_curvature) {
          reoute_fix.forEach((itempath, i) => {
            elemsOut[item].children[i].setAttributeNS(null, 'd', itempath);
          });

        } else {
          elemsOut[item].children[0].setAttributeNS(null, 'd', linecurve);
        }

      }
    })

    const elems = container.querySelectorAll(`.${idSearch}`);
    Object.keys(elems).map(function(item, index) {

      if(elems[item].querySelector('.point') === null) {
        var elemtsearchId_in = container.querySelector(`#${id}`);

        var id_search = elems[item].classList[2].replace('node_out_', '');
        var elemtsearchId = container.querySelector(`#${id_search}`);
        var elemtsearch = elemtsearchId.querySelectorAll('.'+elems[item].classList[3])[0]

        var line_x = elemtsearch.offsetWidth/2 + (elemtsearch.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom;
        var line_y = elemtsearch.offsetHeight/2 + (elemtsearch.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom;

        var elemtsearchId_in = elemtsearchId_in.querySelectorAll('.'+elems[item].classList[4])[0]
        var x = elemtsearchId_in.offsetWidth/2 + (elemtsearchId_in.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom;
        var y = elemtsearchId_in.offsetHeight/2 + (elemtsearchId_in.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom;

        const lineCurve = createCurvature(line_x, line_y, x, y, curvature, 'openclose');
        elems[item].children[0].setAttributeNS(null, 'd', lineCurve );

      } else {
        const points = elems[item].querySelectorAll('.point');
        let linecurve = '';
        const reoute_fix = [];
        points.forEach((item, i) => {
          if(i === 0 && ((points.length -1) === 0)) {

            var elemtsearchId_out = container.querySelector(`#${id}`);
            var elemtsearch = item;

            var line_x = (elemtsearch.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom + rerouteWidth;
            var line_y = (elemtsearch.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom +rerouteWidth;

            var elemtsearchIn = elemtsearchId_out.querySelectorAll('.'+item.parentElement.classList[4])[0]
            var eX =  elemtsearchIn.offsetWidth/2 + (elemtsearchIn.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom;
            var eY =  elemtsearchIn.offsetHeight/2 + (elemtsearchIn.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom;

            var x = eX;
            var y = eY;

            var lineCurveSearch = createCurvature(line_x, line_y, x, y, reroute_curvature_start_end, 'close');
            linecurve += lineCurveSearch;
            reoute_fix.push(lineCurveSearch);

            var elemtsearchId_out = item;
            var id_search = item.parentElement.classList[2].replace('node_out_', '');
            var elemtsearchId = container.querySelector(`#${id_search}`);
            var elemtsearch = elemtsearchId.querySelectorAll('.'+item.parentElement.classList[3])[0]

            var elemtsearchOut = elemtsearchId.querySelectorAll('.'+item.parentElement.classList[3])[0]
            var line_x =  elemtsearchOut.offsetWidth/2 + (elemtsearchOut.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom;
            var line_y =  elemtsearchOut.offsetHeight/2 + (elemtsearchOut.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom;

            var eX = (elemtsearchId_out.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom + rerouteWidth;
            var eY = (elemtsearchId_out.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom + rerouteWidth;
            var x = eX;
            var y = eY;

            var lineCurveSearch = createCurvature(line_x, line_y, x, y, reroute_curvature_start_end, 'open');
            linecurve += lineCurveSearch;
            reoute_fix.push(lineCurveSearch);


          } else if(i === 0) {
            // FIRST
            var elemtsearchId_out = item;
            var id_search = item.parentElement.classList[2].replace('node_out_', '');
            var elemtsearchId = container.querySelector(`#${id_search}`);
            var elemtsearch = elemtsearchId.querySelectorAll('.'+item.parentElement.classList[3])[0]
            var elemtsearchOut = elemtsearchId.querySelectorAll('.'+item.parentElement.classList[3])[0]
            var line_x =  elemtsearchOut.offsetWidth/2 + (elemtsearchOut.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom;
            var line_y =  elemtsearchOut.offsetHeight/2 + (elemtsearchOut.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom;

            var eX = (elemtsearchId_out.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom + rerouteWidth;
            var eY = (elemtsearchId_out.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom + rerouteWidth;
            var x = eX;
            var y = eY;

            var lineCurveSearch = createCurvature(line_x, line_y, x, y, reroute_curvature_start_end, 'open');
            linecurve += lineCurveSearch;
            reoute_fix.push(lineCurveSearch);

            // SECOND
            var elemtsearchId_out = item;
            var elemtsearch = points[i+1];

            var eX = (elemtsearch.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom + rerouteWidth;
            var eY = (elemtsearch.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom +rerouteWidth;
            var line_x = (elemtsearchId_out.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom + rerouteWidth;
            var line_y = (elemtsearchId_out.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom + rerouteWidth;
            var x = eX;
            var y = eY;

            var lineCurveSearch = createCurvature(line_x, line_y, x, y, reroute_curvature, 'other');
            linecurve += lineCurveSearch;
            reoute_fix.push(lineCurveSearch);

          } else if (i === (points.length -1)) {

            var elemtsearchId_out = item;

            var id_search = item.parentElement.classList[1].replace('node_in_', '');
            var elemtsearchId = container.querySelector(`#${id_search}`);
            var elemtsearch = elemtsearchId.querySelectorAll('.'+item.parentElement.classList[4])[0]

            var elemtsearchIn = elemtsearchId.querySelectorAll('.'+item.parentElement.classList[4])[0]
            var eX =  elemtsearchIn.offsetWidth/2 + (elemtsearchIn.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom;
            var eY =  elemtsearchIn.offsetHeight/2 + (elemtsearchIn.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom;

            var line_x = (elemtsearchId_out.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom + rerouteWidth;
            var line_y = (elemtsearchId_out.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom + rerouteWidth;
            var x = eX;
            var y = eY;

            var lineCurveSearch = createCurvature(line_x, line_y, x, y, reroute_curvature_start_end, 'close');
            linecurve += lineCurveSearch;
            reoute_fix.push(lineCurveSearch);

          } else {

            var elemtsearchId_out = item;
            var elemtsearch = points[i+1];

            var eX = (elemtsearch.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom + rerouteWidth;
            var eY = (elemtsearch.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom +rerouteWidth;
            var line_x = (elemtsearchId_out.getBoundingClientRect().x - precanvas.getBoundingClientRect().x ) * precanvasWitdhZoom + rerouteWidth;
            var line_y = (elemtsearchId_out.getBoundingClientRect().y - precanvas.getBoundingClientRect().y ) * precanvasHeightZoom + rerouteWidth;
            var x = eX;
            var y = eY;

            var lineCurveSearch = createCurvature(line_x, line_y, x, y, reroute_curvature, 'other');
            linecurve += lineCurveSearch;
            reoute_fix.push(lineCurveSearch);
          }

        });
        if(reroute_fix_curvature) {
          reoute_fix.forEach((itempath, i) => {
            elems[item].children[i].setAttributeNS(null, 'd', itempath);
          });

        } else {
          elems[item].children[0].setAttributeNS(null, 'd', linecurve);
        }

      }
    })
  }

  /**
   * 双击事件，添加/删除中间点
   */
  dblclick(e) {
    if(this.connection_selected != null && this.reroute) {
        this.createReroutePoint(this.connection_selected);
    }

    if(e.target.classList[0] === 'point') {
        this.removeReroutePoint(e.target);
    }
  }

  /**
   * 创建中间点
   */
  createReroutePoint(ele) {
      this.connection_selected.classList.remove("selected");
      const nodeUpdate = this.connection_selected.parentElement.classList[2].slice(9);
      const nodeUpdateIn = this.connection_selected.parentElement.classList[1].slice(13);
      const output_class = this.connection_selected.parentElement.classList[3];
      const input_class = this.connection_selected.parentElement.classList[4];
      this.connection_selected = null;
      const point = document.createElementNS('http://www.w3.org/2000/svg',"circle");
      point.classList.add("point");
      var pos_x = this.pos_x * ( this.precanvas.clientWidth / (this.precanvas.clientWidth * this.zoom)) - (this.precanvas.getBoundingClientRect().x * ( this.precanvas.clientWidth / (this.precanvas.clientWidth * this.zoom)));
      var pos_y = this.pos_y * ( this.precanvas.clientHeight / (this.precanvas.clientHeight * this.zoom)) - (this.precanvas.getBoundingClientRect().y * ( this.precanvas.clientHeight / (this.precanvas.clientHeight * this.zoom)));

      point.setAttributeNS(null, 'cx', pos_x);
      point.setAttributeNS(null, 'cy', pos_y);
      point.setAttributeNS(null, 'r', this.reroute_width);

      let position_add_array_point = 0;
      if(this.reroute_fix_curvature) {

        const numberPoints = ele.parentElement.querySelectorAll(".main-path").length;
        var path = document.createElementNS('http://www.w3.org/2000/svg',"path");
        path.classList.add("main-path");
        path.setAttributeNS(null, 'd', '');

        ele.parentElement.insertBefore(path, ele.parentElement.children[numberPoints]);
        if(numberPoints === 1) {
          ele.parentElement.appendChild(point);
        }  else {
          const search_point = Array.from(ele.parentElement.children).indexOf(ele)
          position_add_array_point = search_point;
          ele.parentElement.insertBefore(point, ele.parentElement.children[search_point+numberPoints+1]);
        }

      } else {
        ele.parentElement.appendChild(point);
      }

      const nodeId = nodeUpdate.slice(5);
      const searchConnection = this.drawflow.drawflow[this.module].data[nodeId].outputs[output_class].connections.findIndex(function(item,i) {
        return item.node ===  nodeUpdateIn && item.output === input_class;
      });

      if(this.drawflow.drawflow[this.module].data[nodeId].outputs[output_class].connections[searchConnection].points === undefined)  {
        this.drawflow.drawflow[this.module].data[nodeId].outputs[output_class].connections[searchConnection].points = [];
      }

      if(this.reroute_fix_curvature) {

        if(position_add_array_point > 0 || this.drawflow.drawflow[this.module].data[nodeId].outputs[output_class].connections[searchConnection].points !== []) {
          this.drawflow.drawflow[this.module].data[nodeId].outputs[output_class].connections[searchConnection].points.splice(position_add_array_point, 0, { pos_x: pos_x, pos_y: pos_y });
        } else {
          this.drawflow.drawflow[this.module].data[nodeId].outputs[output_class].connections[searchConnection].points.push({ pos_x: pos_x, pos_y: pos_y });
        }

        ele.parentElement.querySelectorAll(".main-path").forEach((item, i) => {
          item.classList.remove("selected");
        });

      } else {
        this.drawflow.drawflow[this.module].data[nodeId].outputs[output_class].connections[searchConnection].points.push({ pos_x: pos_x, pos_y: pos_y });
      }

      this.dispatch('addReroute', nodeId);
      this.updateConnectionNodes(nodeUpdate);
  }

  /**
   * 删除中间点
   */
  removeReroutePoint(ele) {
    const nodeUpdate = ele.parentElement.classList[2].slice(9)
    const nodeUpdateIn = ele.parentElement.classList[1].slice(13);
    const output_class = ele.parentElement.classList[3];
    const input_class = ele.parentElement.classList[4];

    let numberPointPosition = Array.from(ele.parentElement.children).indexOf(ele);
    const nodeId = nodeUpdate.slice(5);
    const searchConnection = this.drawflow.drawflow[this.module].data[nodeId].outputs[output_class].connections.findIndex(function(item,i) {
      return item.node ===  nodeUpdateIn && item.output === input_class;
    });

    if(this.reroute_fix_curvature) {
       const numberMainPath = ele.parentElement.querySelectorAll(".main-path").length
       ele.parentElement.children[numberMainPath-1].remove();
       numberPointPosition -= numberMainPath;
       if(numberPointPosition < 0) {
         numberPointPosition = 0;
       }
    } else {
      numberPointPosition--;
    }
    this.drawflow.drawflow[this.module].data[nodeId].outputs[output_class].connections[searchConnection].points.splice(numberPointPosition,1);

    ele.remove();
    this.dispatch('removeReroute', nodeId);
    this.updateConnectionNodes(nodeUpdate);
  }

  /**
   * 注册自定义节点
   */
  registerNode(name, html, props = null, options = null) {
    this.noderegister[name] = {html: html, props: props, options: options};
  }

  /**
   * 根据ID获取节点数据
   */
  getNodeFromId(id) {
    var moduleName = this.getModuleFromNodeId(id)
    return JSON.parse(JSON.stringify(this.drawflow.drawflow[moduleName].data[id]));
  }
  /**
   * 根据名称获取所有节点ID
   */
  getNodesFromName(name) {
    var nodes = [];
    const editor = this.drawflow.drawflow
    Object.keys(editor).map(function(moduleName, index) {
      for (var node in editor[moduleName].data) {
        if(editor[moduleName].data[node].name == name) {
          nodes.push(editor[moduleName].data[node].id);
        }
      }
    });
    return nodes;
  }

  /**
   * 添加节点
   */
  addNode (name, num_in, num_out, ele_pos_x, ele_pos_y, classoverride, data, html, typenode = false) {
    if (this.useuuid) {
      var newNodeId = this.getUuid();
    } else {
      var newNodeId = this.nodeId;
    }
    const parent = document.createElement('div');
    parent.classList.add("parent-node");

    const node = document.createElement('div');
    node.innerHTML = "";
    node.setAttribute("id", "node-"+newNodeId);
    node.classList.add("drawflow-node");
    if(classoverride != '') {
      node.classList.add(...classoverride.split(' '));
    }

    const inputs = document.createElement('div');
    inputs.classList.add("inputs");

    const outputs = document.createElement('div');
    outputs.classList.add("outputs");

    const json_inputs = {};
    if(Array.isArray(num_in)) {
      num_in.forEach((pos, x) => {
        const input = document.createElement('div');
        input.classList.add("input");
        input.classList.add("input_"+(x+1));
        if(pos === 'top' || pos === 'bottom') {
          input.classList.add(pos);
        }
        json_inputs["input_"+(x+1)] = { "connections": []};
        inputs.appendChild(input);
      });
    } else {
      for(var x = 0; x < num_in; x++) {
        const input = document.createElement('div');
        input.classList.add("input");
        input.classList.add("input_"+(x+1));
        json_inputs["input_"+(x+1)] = { "connections": []};
        inputs.appendChild(input);
      }
    }

    const json_outputs = {};
    if(Array.isArray(num_out)) {
      num_out.forEach((pos, x) => {
        const output = document.createElement('div');
        output.classList.add("output");
        output.classList.add("output_"+(x+1));
        if(pos === 'top' || pos === 'bottom') {
          output.classList.add(pos);
        }
        json_outputs["output_"+(x+1)] = { "connections": []};
        outputs.appendChild(output);
      });
    } else {
      for(var x = 0; x < num_out; x++) {
        const output = document.createElement('div');
        output.classList.add("output");
        output.classList.add("output_"+(x+1));
        json_outputs["output_"+(x+1)] = { "connections": []};
        outputs.appendChild(output);
      }
    }

    const content = document.createElement('div');
    content.classList.add("drawflow_content_node");
    if(typenode === false) {
      content.innerHTML = html;
    } else if (typenode === true) {
      content.appendChild(this.noderegister[html].html.cloneNode(true));
    } else {
      if(parseInt(this.render.version) === 3 ) {
        //Vue 3
        let wrapper = this.render.h(this.noderegister[html].html, this.noderegister[html].props, this.noderegister[html].options);
        wrapper.appContext = this.parent;
        this.render.render(wrapper,content);

      } else {
        // Vue 2
        let wrapper = new this.render({
          parent: this.parent,
          render: h => h(this.noderegister[html].html, { props: this.noderegister[html].props }),
          ...this.noderegister[html].options
        }).$mount()
        //
        content.appendChild(wrapper.$el);
      }
    }

    Object.entries(data).forEach(function (key, value) {
      if(typeof key[1] === "object") {
        insertObjectkeys(null, key[0], key[0]);
      } else {
        var elems = content.querySelectorAll('[df-'+key[0]+']');
          for(var i = 0; i < elems.length; i++) {
            elems[i].value = key[1];
            if(elems[i].isContentEditable) {
              elems[i].innerText = key[1];
            }
          }
      }
    })

    function insertObjectkeys(object, name, completname) {
      if(object === null) {
        var object = data[name];
      } else {
        var object = object[name]
      }
      if(object !== null) {
        Object.entries(object).forEach(function (key, value) {
          if(typeof key[1] === "object") {
            insertObjectkeys(object, key[0], completname+'-'+key[0]);
          } else {
            var elems = content.querySelectorAll('[df-'+completname+'-'+key[0]+']');
              for(var i = 0; i < elems.length; i++) {
                elems[i].value = key[1];
                if(elems[i].isContentEditable) {
                  elems[i].innerText = key[1];
                }
              }
          }
        });
      }
    }
    node.appendChild(inputs);
    node.appendChild(content);
    node.appendChild(outputs);
    node.style.top = ele_pos_y + "px";
    node.style.left = ele_pos_x + "px";
    parent.appendChild(node);
    this.precanvas.appendChild(parent);
    var json = {
      id: newNodeId,
      name: name,
      data: data,
      class: classoverride,
      html: html,
      typenode: typenode,
      inputs: json_inputs,
      outputs: json_outputs,
      pos_x: ele_pos_x,
      pos_y: ele_pos_y,
    }
    this.drawflow.drawflow[this.module].data[newNodeId] = json;
    this.dispatch('nodeCreated', newNodeId);
    if (!this.useuuid) {
      this.nodeId++;
    }
    return newNodeId;
  }

  /**
   * 导入节点（用于数据还原）
   */
  addNodeImport (dataNode, precanvas) {
    const parent = document.createElement('div');
    parent.classList.add("parent-node");

    const node = document.createElement('div');
    node.innerHTML = "";
    node.setAttribute("id", "node-"+dataNode.id);
    node.classList.add("drawflow-node");
    if(dataNode.class != '') {
      node.classList.add(...dataNode.class.split(' '));
    }

    const inputs = document.createElement('div');
    inputs.classList.add("inputs");

    const outputs = document.createElement('div');
    outputs.classList.add("outputs");

    Object.keys(dataNode.inputs).map(function(input_item, index) {
      const input = document.createElement('div');
      input.classList.add("input");
      input.classList.add(input_item);
      inputs.appendChild(input);
      Object.keys(dataNode.inputs[input_item].connections).map(function(output_item, index) {

        var connection = document.createElementNS('http://www.w3.org/2000/svg',"svg");
        var path = document.createElementNS('http://www.w3.org/2000/svg',"path");
        path.classList.add("main-path");
        path.setAttributeNS(null, 'd', '');
        // path.innerHTML = 'a';
        connection.classList.add("connection");
        connection.classList.add("node_in_node-"+dataNode.id);
        connection.classList.add("node_out_node-"+dataNode.inputs[input_item].connections[output_item].node);
        connection.classList.add(dataNode.inputs[input_item].connections[output_item].input);
        connection.classList.add(input_item);

        connection.appendChild(path);
        precanvas.appendChild(connection);

      });
    });

    for(var x = 0; x < Object.keys(dataNode.outputs).length; x++) {
      const output = document.createElement('div');
      output.classList.add("output");
      output.classList.add("output_"+(x+1));
      outputs.appendChild(output);
    }

    const content = document.createElement('div');
    content.classList.add("drawflow_content_node");

    if(dataNode.typenode === false) {
      content.innerHTML = dataNode.html;
    } else if (dataNode.typenode === true) {
      content.appendChild(this.noderegister[dataNode.html].html.cloneNode(true));
    } else {
      if(parseInt(this.render.version) === 3 ) {
        //Vue 3
        let wrapper = this.render.h(this.noderegister[dataNode.html].html, this.noderegister[dataNode.html].props, this.noderegister[dataNode.html].options);
        wrapper.appContext = this.parent;
        this.render.render(wrapper,content);

      } else {
        //Vue 2
        let wrapper = new this.render({
          parent: this.parent,
          render: h => h(this.noderegister[dataNode.html].html, { props: this.noderegister[dataNode.html].props }),
          ...this.noderegister[dataNode.html].options
        }).$mount()
        content.appendChild(wrapper.$el);
      }
    }

    Object.entries(dataNode.data).forEach(function (key, value) {
      if(typeof key[1] === "object") {
        insertObjectkeys(null, key[0], key[0]);
      } else {
        var elems = content.querySelectorAll('[df-'+key[0]+']');
          for(var i = 0; i < elems.length; i++) {
            elems[i].value = key[1];
            if(elems[i].isContentEditable) {
              elems[i].innerText = key[1];
            }
          }
      }
    })

    function insertObjectkeys(object, name, completname) {
      if(object === null) {
        var object = dataNode.data[name];
      } else {
        var object = object[name]
      }
      if(object !== null) {
        Object.entries(object).forEach(function (key, value) {
          if(typeof key[1] === "object") {
            insertObjectkeys(object, key[0], completname+'-'+key[0]);
          } else {
            var elems = content.querySelectorAll('[df-'+completname+'-'+key[0]+']');
              for(var i = 0; i < elems.length; i++) {
                elems[i].value = key[1];
                if(elems[i].isContentEditable) {
                  elems[i].innerText = key[1];
                }
              }
          }
        });
      }
    }
    node.appendChild(inputs);
    node.appendChild(content);
    node.appendChild(outputs);
    node.style.top = dataNode.pos_y + "px";
    node.style.left = dataNode.pos_x + "px";
    parent.appendChild(node);
    this.precanvas.appendChild(parent);
  }

  /**
   * 导入中间点
   */
  addRerouteImport(dataNode) {
    const reroute_width = this.reroute_width
    const reroute_fix_curvature = this.reroute_fix_curvature
    const container = this.container;
    Object.keys(dataNode.outputs).map(function(output_item, index) {
      Object.keys(dataNode.outputs[output_item].connections).map(function(input_item, index) {
        const points = dataNode.outputs[output_item].connections[input_item].points
        if(points !== undefined) {

          points.forEach((item, i) => {
            const input_id = dataNode.outputs[output_item].connections[input_item].node;
            const input_class = dataNode.outputs[output_item].connections[input_item].output;
            const ele = container.querySelector('.connection.node_in_node-'+input_id+'.node_out_node-'+dataNode.id+'.'+output_item+'.'+input_class);

            if(reroute_fix_curvature) {
              if(i === 0) {
                for (var z = 0; z < points.length; z++) {
                  var path = document.createElementNS('http://www.w3.org/2000/svg',"path");
                  path.classList.add("main-path");
                  path.setAttributeNS(null, 'd', '');
                  ele.appendChild(path);

                }
              }
            }

            const point = document.createElementNS('http://www.w3.org/2000/svg',"circle");
            point.classList.add("point");
            var pos_x = item.pos_x;
            var pos_y = item.pos_y;

            point.setAttributeNS(null, 'cx', pos_x);
            point.setAttributeNS(null, 'cy', pos_y);
            point.setAttributeNS(null, 'r', reroute_width);

            ele.appendChild(point);
          });
        };
      });
    });
  }

  /**
   * 输入框内容变更时，更新节点数据
   */
  updateNodeValue(event) {
    var attr = event.target.attributes
    for (var i = 0; i < attr.length; i++) {
            if (attr[i].nodeName.startsWith('df-')) {
                var keys = attr[i].nodeName.slice(3).split("-");
                var target = this.drawflow.drawflow[this.module].data[event.target.closest(".drawflow_content_node").parentElement.id.slice(5)].data;
                for (var index = 0; index < keys.length - 1; index += 1) {
                    if (target[keys[index]] == null) {
                        target[keys[index]] = {};
                    }
                    target = target[keys[index]];
                }
                target[keys[keys.length - 1]] = event.target.value;
                if(event.target.isContentEditable) {
                  target[keys[keys.length - 1]] = event.target.innerText;
                }
                this.dispatch('nodeDataChanged', event.target.closest(".drawflow_content_node").parentElement.id.slice(5));
          }
    }
  }

  /**
   * 通过ID更新节点数据
   */
  updateNodeDataFromId(id, data) {
    var moduleName = this.getModuleFromNodeId(id)
    this.drawflow.drawflow[moduleName].data[id].data = data;
    if(this.module === moduleName) {
      const content = this.container.querySelector('#node-'+id);

      Object.entries(data).forEach(function (key, value) {
        if(typeof key[1] === "object") {
          insertObjectkeys(null, key[0], key[0]);
        } else {
          var elems = content.querySelectorAll('[df-'+key[0]+']');
            for(var i = 0; i < elems.length; i++) {
              elems[i].value = key[1];
              if(elems[i].isContentEditable) {
                elems[i].innerText = key[1];
              }
            }
        }
      })

      function insertObjectkeys(object, name, completname) {
        if(object === null) {
          var object = data[name];
        } else {
          var object = object[name]
        }
        if(object !== null) {
          Object.entries(object).forEach(function (key, value) {
            if(typeof key[1] === "object") {
              insertObjectkeys(object, key[0], completname+'-'+key[0]);
            } else {
              var elems = content.querySelectorAll('[df-'+completname+'-'+key[0]+']');
                for(var i = 0; i < elems.length; i++) {
                  elems[i].value = key[1];
                  if(elems[i].isContentEditable) {
                    elems[i].innerText = key[1];
                  }
                }
            }
          });
        }
      }

    }
  }

  /**
   * 添加输入端口
   */
  addNodeInput(id) {
    var moduleName = this.getModuleFromNodeId(id)
    const infoNode = this.getNodeFromId(id)
    const numInputs = Object.keys(infoNode.inputs).length;
    if(this.module === moduleName) {
      //Draw input
      const input = document.createElement('div');
      input.classList.add("input");
      input.classList.add("input_"+(numInputs+1));
      const parent = this.container.querySelector('#node-'+id+' .inputs');
      parent.appendChild(input);
      this.updateConnectionNodes('node-'+id);

    }
    this.drawflow.drawflow[moduleName].data[id].inputs["input_"+(numInputs+1)] = { "connections": []};
  }

  /**
   * 添加输出端口
   */
  addNodeOutput(id) {
    var moduleName = this.getModuleFromNodeId(id)
    const infoNode = this.getNodeFromId(id)
    const numOutputs = Object.keys(infoNode.outputs).length;
    if(this.module === moduleName) {
      //Draw output
      const output = document.createElement('div');
      output.classList.add("output");
      output.classList.add("output_"+(numOutputs+1));
      const parent = this.container.querySelector('#node-'+id+' .outputs');
      parent.appendChild(output);
      this.updateConnectionNodes('node-'+id);

    }
    this.drawflow.drawflow[moduleName].data[id].outputs["output_"+(numOutputs+1)] = { "connections": []};
  }

  /**
   * 移除输入端口
   */
  removeNodeInput(id, input_class) {
    var moduleName = this.getModuleFromNodeId(id)
    const infoNode = this.getNodeFromId(id)
    if(this.module === moduleName) {
      this.container.querySelector('#node-'+id+' .inputs .input.'+input_class).remove();
    }
    const removeInputs = [];
    Object.keys(infoNode.inputs[input_class].connections).map(function(key, index) {
      const id_output = infoNode.inputs[input_class].connections[index].node;
      const output_class = infoNode.inputs[input_class].connections[index].input;
      removeInputs.push({id_output, id, output_class, input_class})
    })
    // Remove connections
    removeInputs.forEach((item, i) => {
      this.removeSingleConnection(item.id_output, item.id, item.output_class, item.input_class);
    });

    delete this.drawflow.drawflow[moduleName].data[id].inputs[input_class];

    // Update connection
    const connections = [];
    const connectionsInputs = this.drawflow.drawflow[moduleName].data[id].inputs
    Object.keys(connectionsInputs).map(function(key, index) {
      connections.push(connectionsInputs[key]);
    });
    this.drawflow.drawflow[moduleName].data[id].inputs = {};
    const input_class_id = input_class.slice(6);
    let nodeUpdates = [];
    connections.forEach((item, i) => {
      item.connections.forEach((itemx, f) => {
        nodeUpdates.push(itemx);
      });
      this.drawflow.drawflow[moduleName].data[id].inputs['input_'+ (i+1)] = item;
    });
    nodeUpdates =  new Set(nodeUpdates.map(e => JSON.stringify(e)));
    nodeUpdates = Array.from(nodeUpdates).map(e => JSON.parse(e));

    if(this.module === moduleName) {
      const eles = this.container.querySelectorAll("#node-"+id +" .inputs .input");
      eles.forEach((item, i) => {
        const id_class = item.classList[1].slice(6);
        if(parseInt(input_class_id) < parseInt(id_class)) {
          item.classList.remove('input_'+id_class);
          item.classList.add('input_'+(id_class-1));
        }
      });

    }

    nodeUpdates.forEach((itemx, i) => {
      this.drawflow.drawflow[moduleName].data[itemx.node].outputs[itemx.input].connections.forEach((itemz, g) => {
          if(itemz.node == id) {
            const output_id = itemz.output.slice(6);
            if(parseInt(input_class_id) < parseInt(output_id)) {
              if(this.module === moduleName) {
                const ele = this.container.querySelector(".connection.node_in_node-"+id+".node_out_node-"+itemx.node+"."+itemx.input+".input_"+output_id);
                ele.classList.remove('input_'+output_id);
                ele.classList.add('input_'+(output_id-1));
              }
              if(itemz.points) {
                  this.drawflow.drawflow[moduleName].data[itemx.node].outputs[itemx.input].connections[g] = { node: itemz.node, output: 'input_'+(output_id-1), points: itemz.points }
              } else {
                  this.drawflow.drawflow[moduleName].data[itemx.node].outputs[itemx.input].connections[g] = { node: itemz.node, output: 'input_'+(output_id-1)}
              }
            }
          }
      });
    });
    this.updateConnectionNodes('node-'+id);
  }

  /**
   * 移除输出端口
   */
  removeNodeOutput(id, output_class) {
    var moduleName = this.getModuleFromNodeId(id)
    const infoNode = this.getNodeFromId(id)
    if(this.module === moduleName) {
      this.container.querySelector('#node-'+id+' .outputs .output.'+output_class).remove();
    }
    const removeOutputs = [];
    Object.keys(infoNode.outputs[output_class].connections).map(function(key, index) {
      const id_input = infoNode.outputs[output_class].connections[index].node;
      const input_class = infoNode.outputs[output_class].connections[index].output;
      removeOutputs.push({id, id_input, output_class, input_class})
    })
    // Remove connections
    removeOutputs.forEach((item, i) => {
      this.removeSingleConnection(item.id, item.id_input, item.output_class, item.input_class);
    });

    delete this.drawflow.drawflow[moduleName].data[id].outputs[output_class];

    // Update connection
    const connections = [];
    const connectionsOuputs = this.drawflow.drawflow[moduleName].data[id].outputs
    Object.keys(connectionsOuputs).map(function(key, index) {
      connections.push(connectionsOuputs[key]);
    });
    this.drawflow.drawflow[moduleName].data[id].outputs = {};
    const output_class_id = output_class.slice(7);
    let nodeUpdates = [];
    connections.forEach((item, i) => {
      item.connections.forEach((itemx, f) => {
        nodeUpdates.push({ node: itemx.node, output: itemx.output });
      });
      this.drawflow.drawflow[moduleName].data[id].outputs['output_'+ (i+1)] = item;
    });
    nodeUpdates =  new Set(nodeUpdates.map(e => JSON.stringify(e)));
    nodeUpdates = Array.from(nodeUpdates).map(e => JSON.parse(e));

    if(this.module === moduleName) {
      const eles = this.container.querySelectorAll("#node-"+id +" .outputs .output");
      eles.forEach((item, i) => {
        const id_class = item.classList[1].slice(7);
        if(parseInt(output_class_id) < parseInt(id_class)) {
          item.classList.remove('output_'+id_class);
          item.classList.add('output_'+(id_class-1));
        }
      });

    }

    nodeUpdates.forEach((itemx, i) => {
      this.drawflow.drawflow[moduleName].data[itemx.node].inputs[itemx.output].connections.forEach((itemz, g) => {
          if(itemz.node == id) {
            const input_id = itemz.input.slice(7);
            if(parseInt(output_class_id) < parseInt(input_id)) {
              if(this.module === moduleName) {

                const ele = this.container.querySelector(".connection.node_in_node-"+itemx.node+".node_out_node-"+id+".output_"+input_id+"."+itemx.output);
                ele.classList.remove('output_'+input_id);
                ele.classList.remove(itemx.output);
                ele.classList.add('output_'+(input_id-1));
                ele.classList.add(itemx.output);
              }
              if(itemz.points) {
                  this.drawflow.drawflow[moduleName].data[itemx.node].inputs[itemx.output].connections[g] = { node: itemz.node, input: 'output_'+(input_id-1), points: itemz.points }
              } else {
                  this.drawflow.drawflow[moduleName].data[itemx.node].inputs[itemx.output].connections[g] = { node: itemz.node, input: 'output_'+(input_id-1)}
              }
            }
          }
      });
    });

    this.updateConnectionNodes('node-'+id);
  }

  /**
   * 移除节点
   */
  removeNodeId(id) {
    this.removeConnectionNodeId(id);
    var moduleName = this.getModuleFromNodeId(id.slice(5))
    if(this.module === moduleName) {
      this.container.querySelector(`#${id}`).remove();
    }
    delete this.drawflow.drawflow[moduleName].data[id.slice(5)];
    this.dispatch('nodeRemoved', id.slice(5));
  }

  /**
   * 移除选中的连线
   */
  removeConnection() {
    if(this.connection_selected != null) {
      var listclass = this.connection_selected.parentElement.classList;
      this.connection_selected.parentElement.remove();
      //console.log(listclass);
      var index_out = this.drawflow.drawflow[this.module].data[listclass[2].slice(14)].outputs[listclass[3]].connections.findIndex(function(item,i) {
        return item.node === listclass[1].slice(13) && item.output === listclass[4]
      });
      this.drawflow.drawflow[this.module].data[listclass[2].slice(14)].outputs[listclass[3]].connections.splice(index_out,1);

      var index_in = this.drawflow.drawflow[this.module].data[listclass[1].slice(13)].inputs[listclass[4]].connections.findIndex(function(item,i) {
        return item.node === listclass[2].slice(14) && item.input === listclass[3]
      });
      this.drawflow.drawflow[this.module].data[listclass[1].slice(13)].inputs[listclass[4]].connections.splice(index_in,1);
      this.dispatch('connectionRemoved', { output_id: listclass[2].slice(14), input_id: listclass[1].slice(13), output_class: listclass[3], input_class: listclass[4] } );
      this.connection_selected = null;
    }
  }

  /**
   * 移除单条连线
   */
  removeSingleConnection(id_output, id_input, output_class, input_class) {
    var nodeOneModule = this.getModuleFromNodeId(id_output);
    var nodeTwoModule = this.getModuleFromNodeId(id_input);
    if(nodeOneModule === nodeTwoModule) {
      // Check nodes in same module.

      // Check connection exist
      var exists = this.drawflow.drawflow[nodeOneModule].data[id_output].outputs[output_class].connections.findIndex(function(item,i) {
        return item.node == id_input && item.output === input_class
      });
      if(exists > -1) {

        if(this.module === nodeOneModule) {
          // In same module with view.
          this.container.querySelector('.connection.node_in_node-'+id_input+'.node_out_node-'+id_output+'.'+output_class+'.'+input_class).remove();
        }

        var index_out = this.drawflow.drawflow[nodeOneModule].data[id_output].outputs[output_class].connections.findIndex(function(item,i) {
          return item.node == id_input && item.output === input_class
        });
        this.drawflow.drawflow[nodeOneModule].data[id_output].outputs[output_class].connections.splice(index_out,1);

        var index_in = this.drawflow.drawflow[nodeOneModule].data[id_input].inputs[input_class].connections.findIndex(function(item,i) {
          return item.node == id_output && item.input === output_class
        });
        this.drawflow.drawflow[nodeOneModule].data[id_input].inputs[input_class].connections.splice(index_in,1);

        this.dispatch('connectionRemoved', { output_id: id_output, input_id: id_input, output_class:  output_class, input_class: input_class});
        return true;

      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  /**
   * 移除与节点相关的所有连线
   */
  removeConnectionNodeId(id) {
    const idSearchIn = 'node_in_'+id;
    const idSearchOut = 'node_out_'+id;

    const elemsOut = this.container.querySelectorAll(`.${idSearchOut}`);
    for(var i = elemsOut.length-1; i >= 0; i--) {
      var listclass = elemsOut[i].classList;

      var index_in = this.drawflow.drawflow[this.module].data[listclass[1].slice(13)].inputs[listclass[4]].connections.findIndex(function(item,i) {
        return item.node === listclass[2].slice(14) && item.input === listclass[3]
      });
      this.drawflow.drawflow[this.module].data[listclass[1].slice(13)].inputs[listclass[4]].connections.splice(index_in,1);

      var index_out = this.drawflow.drawflow[this.module].data[listclass[2].slice(14)].outputs[listclass[3]].connections.findIndex(function(item,i) {
        return item.node === listclass[1].slice(13) && item.output === listclass[4]
      });
      this.drawflow.drawflow[this.module].data[listclass[2].slice(14)].outputs[listclass[3]].connections.splice(index_out,1);

      elemsOut[i].remove();

      this.dispatch('connectionRemoved', { output_id: listclass[2].slice(14), input_id: listclass[1].slice(13), output_class: listclass[3], input_class: listclass[4] } );
    }

    const elemsIn = this.container.querySelectorAll(`.${idSearchIn}`);
    for(var i = elemsIn.length-1; i >= 0; i--) {

      var listclass = elemsIn[i].classList;

      var index_out = this.drawflow.drawflow[this.module].data[listclass[2].slice(14)].outputs[listclass[3]].connections.findIndex(function(item,i) {
        return item.node === listclass[1].slice(13) && item.output === listclass[4]
      });
      this.drawflow.drawflow[this.module].data[listclass[2].slice(14)].outputs[listclass[3]].connections.splice(index_out,1);

      var index_in = this.drawflow.drawflow[this.module].data[listclass[1].slice(13)].inputs[listclass[4]].connections.findIndex(function(item,i) {
        return item.node === listclass[2].slice(14) && item.input === listclass[3]
      });
      this.drawflow.drawflow[this.module].data[listclass[1].slice(13)].inputs[listclass[4]].connections.splice(index_in,1);

      elemsIn[i].remove();

      this.dispatch('connectionRemoved', { output_id: listclass[2].slice(14), input_id: listclass[1].slice(13), output_class: listclass[3], input_class: listclass[4] } );
    }
  }

  /**
   * 通过节点ID获取所属模块
   */
  getModuleFromNodeId(id) {
    var nameModule;
    const editor = this.drawflow.drawflow
    Object.keys(editor).map(function(moduleName, index) {
      Object.keys(editor[moduleName].data).map(function(node, index2) {
        if(node == id) {
          nameModule = moduleName;
        }
      })
    });
    return nameModule;
  }

  /**
   * 添加模块
   */
  addModule(name) {
    this.drawflow.drawflow[name] =  { "data": {} };
    this.dispatch('moduleCreated', name);
  }
  /**
   * 切换模块
   */
  changeModule(name) {
    this.dispatch('moduleChanged', name);
    this.module = name;
    this.precanvas.innerHTML = "";
    this.canvas_x = 0;
    this.canvas_y = 0;
    this.pos_x = 0;
    this.pos_y = 0;
    this.mouse_x = 0;
    this.mouse_y = 0;
    this.zoom = 1;
    this.zoom_last_value = 1;
    this.precanvas.style.transform = '';
    this.import(this.drawflow, false);
  }

  /**
   * 移除模块
   */
  removeModule(name) {
    if(this.module === name) {
      this.changeModule('Home');
    }
    delete this.drawflow.drawflow[name];
    this.dispatch('moduleRemoved', name);
  }

  /**
   * 清空当前模块
   */
  clearModuleSelected() {
    this.precanvas.innerHTML = "";
    this.drawflow.drawflow[this.module] =  { "data": {} };
  }

  /**
   * 清空所有数据
   */
  clear () {
    this.precanvas.innerHTML = "";
    this.drawflow = { "drawflow": { "Home": { "data": {} }}};
  }
  /**
   * 导出数据
   */
  export () {
    const dataExport = JSON.parse(JSON.stringify(this.drawflow));
    this.dispatch('export', dataExport);
    return dataExport;
  }

  /**
   * 导入数据
   */
  import (data, notifi = true) {
    this.clear();
    this.drawflow = JSON.parse(JSON.stringify(data));
    this.load();
    if(notifi) {
      this.dispatch('import', 'import');
    }
  }

  /* 事件相关方法 */

  /**
   * 注册事件监听器
   */
  on (event, callback) {
       // Check if the callback is not a function
       if (typeof callback !== 'function') {
           console.error(`The listener callback must be a function, the given type is ${typeof callback}`);
           return false;
       }
       // Check if the event is not a string
       if (typeof event !== 'string') {
           console.error(`The event name must be a string, the given type is ${typeof event}`);
           return false;
       }
       // Check if this event not exists
       if (this.events[event] === undefined) {
           this.events[event] = {
               listeners: []
           }
       }
       this.events[event].listeners.push(callback);
   }

   /**
   * 移除事件监听器
   */
   removeListener (event, callback) {
      // Check if this event not exists

      if (!this.events[event]) return false

      const listeners = this.events[event].listeners
      const listenerIndex = listeners.indexOf(callback)
      const hasListener = listenerIndex > -1
      if (hasListener) listeners.splice(listenerIndex, 1)
   }

   /**
   * 触发事件
   */
   dispatch (event, details) {
       // Check if this event not exists
       if (this.events[event] === undefined) {
           // console.error(`This event: ${event} does not exist`);
           return false;
       }
       this.events[event].listeners.forEach((listener) => {
           listener(details);
       });
   }

    /**
     * 生成UUID
     */
    getUuid() {
        // http://www.ietf.org/rfc/rfc4122.txt
        var s = [];
        var hexDigits = "0123456789abcdef";
        for (var i = 0; i < 36; i++) {
            s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
        }
        s[14] = "4";  // bits 12-15 of the time_hi_and_version field to 0010
        s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1);  // bits 6-7 of the clock_seq_hi_and_reserved to 01
        s[8] = s[13] = s[18] = s[23] = "-";

        var uuid = s.join("");
        return uuid;
    }
}
