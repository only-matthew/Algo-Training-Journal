// 字节上限的单一来源。
//
// 这些数字同时被浏览器（选文件时就该拦住）、Worker（保存时校验）与 schema 校验
// （题面附件对象的 bytes 字段）使用。分散写字面量的后果是：改了一处，另一处仍在
// 按旧值放行或拒绝，用户看到的是"选好了文件、保存时才被 413"。
//
// 本模块刻意不 import 任何本地模块：它是最底层的叶子，可以被 lib/ 与 workers/ 任意
// 引用而不制造循环依赖。

/** 单份题面 PDF 的上限。 */
export const ATTACHMENT_MAX_BYTES = 5_242_880; // 5 MiB

/** 一次保存里"新增"PDF 的合计上限。 */
export const ATTACHMENT_MAX_NEW_BYTES = 10_485_760; // 10 MiB

/** 整个 multipart 请求（payload + 附件 + 题面图片）的上限。 */
export const MULTIPART_MAX_BYTES = 12_582_912; // 12 MiB
