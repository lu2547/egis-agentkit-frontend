import { createApp } from "vue";
import Button from "tdesign-vue-next/es/button";
import Checkbox from "tdesign-vue-next/es/checkbox";
import Dialog from "tdesign-vue-next/es/dialog";
import Drawer from "tdesign-vue-next/es/drawer";
import Input from "tdesign-vue-next/es/input";
import Loading from "tdesign-vue-next/es/loading";
import Popconfirm from "tdesign-vue-next/es/popconfirm";
import Popup from "tdesign-vue-next/es/popup";
import { RadioGroup, RadioButton } from "tdesign-vue-next/es/radio";
import Select from "tdesign-vue-next/es/select";
import Table from "tdesign-vue-next/es/table";
import Tag from "tdesign-vue-next/es/tag";
import Textarea from "tdesign-vue-next/es/textarea";
import "tdesign-vue-next/es/style/index.css";
import App from "./App.vue";
import { initializeTheme } from "./composables/useTheme";
import { fieldLabel } from "./directives/fieldLabel";
import { router } from "./router";
import "./styles.css";
initializeTheme();
const app = createApp(App);
for (const [name, component] of Object.entries({
  TButton: Button,
  TCheckbox: Checkbox,
  TDialog: Dialog,
  TDrawer: Drawer,
  TInput: Input,
  TLoading: Loading,
  TPopconfirm: Popconfirm,
  TPopup: Popup,
  TRadioGroup: RadioGroup,
  TRadioButton: RadioButton,
  TSelect: Select,
  TTable: Table,
  TTag: Tag,
  TTextarea: Textarea,
}))
  app.component(name, component);
app.directive("field-label", fieldLabel).use(router).mount("#app");
