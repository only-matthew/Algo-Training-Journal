#include <cstdio>
#include <iostream>
#include <string>

std::string ans[2000];  // ans[i] 是图腾的第 i 行
int n;

// 当前 ans[0 .. rows-1] 存着一个图腾：
//   共 rows 行，每行宽度 = 2 * rows（两端带空格保证对齐）
// 本函数把它扩展成 2*rows 行、每行 4*rows 宽的图腾。
void grow(int rows)
{
    // 1. 下半部分 = 上半部分左右拼接两份（对应"左下 + 右下"两个子图腾）
    for (int i = rows; i < rows * 2; i++)
        ans[i] = ans[i - rows] + ans[i - rows];

    // 2. 上半部分左右各补 rows 个空格，变成居中（对应"顶部"那个子图腾）
    for (int i = 0; i < rows; i++)
    {
        ans[i].insert(0, rows, ' ');            // 行首插 rows 个空格
        ans[i].insert(ans[i].length(), rows, ' '); // 行尾补 rows 个空格
    }
}

int main()
{
    scanf("%d", &n);

    // 基础图腾：4 列宽，两端各带一个空格，保证左右对称、便于拼接
    ans[0] = " /\\ ";
    ans[1] = "/__\\";

    for (int i = 1; i < n; i++)
        grow(1 << i);   // 第 i 轮时当前图腾有 2^i 行

    for (int i = 0; i < (1 << n); i++)
        std::cout << ans[i] << std::endl;
}