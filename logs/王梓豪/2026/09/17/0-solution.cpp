#include <bits/stdc++.h>
using namespace std;

// 高精度整数：用 vector<int> 存储，每位存 4 位十进制，低位在前
struct Big
{
    vector<int> a;
    
    // 构造函数：从 int 初始化
    Big(int x = 0)
    {
        if (!x) a.push_back(0);
        while (x) a.push_back(x % 10000), x /= 10000;
    }
    
    // 去除前导 0
    void trim()
    {
        while (a.size() > 1 && !a.back()) a.pop_back();
    }
    
    // 比较大小：先比长度，再从高位到低位逐位比较
    bool operator > (const Big &b) const
    {
        if (a.size() != b.a.size()) return a.size() > b.a.size();
        for (int i = a.size() - 1; i >= 0; i--)
            if (a[i] != b.a[i]) return a[i] > b.a[i];
        return false;
    }
    
    // 高精度乘法：模拟竖式，每位最多 4 位十进制
    Big operator * (const Big &b) const
    {
        Big c;
        c.a.assign(a.size() + b.a.size() + 1, 0);
        for (int i = 0; i < a.size(); i++)
        {
            long long t = 0;
            for (int j = 0; j < b.a.size(); j++)
            {
                t += c.a[i + j] + 1LL * a[i] * b.a[j];
                c.a[i + j] = t % 10000;
                t /= 10000;
            }
            // 处理剩余进位
            int p = i + b.a.size();
            while (t) c.a[p] += t % 10000, t /= 10000, p++;
        }
        c.trim();
        return c;
    }
    
    // 输出：最高位正常输出，其余位补 0 至 4 位
    void print()
    {
        cout << a.back();
        for (int i = a.size() - 2; i >= 0; i--)
            cout << setw(4) << setfill('0') << a[i];
    }
};

Big num[45][45];     // num[i][j]: 字符串 s[i..j) 对应的高精度数
Big dp[45][10];      // dp[i][j]: 前 i 个数字分成 j 段的最大乘积
bool vis[45][10];    // vis[i][j]: dp[i][j] 是否为合法状态

// 将字符串 s[l..r) 转换为高精度数
Big get(string &s, int l, int r)
{
    Big x(0);
    for (int i = l; i < r; i++)
    {
        int d = s[i] - '0', c = d;
        // 模拟 x = x * 10 + d
        for (int j = 0; j < x.a.size(); j++)
        {
            int t = x.a[j] * 10 + c;
            x.a[j] = t % 10000;
            c = t / 10000;
        }
        if (c) x.a.push_back(c);
    }
    x.trim();
    return x;
}

int main()
{
    int n, k;
    string s;
    cin >> n >> k >> s;
    
    // 预处理所有区间 [i, j) 对应的数值
    for (int i = 0; i < n; i++)
        for (int j = i + 1; j <= n; j++)
            num[i][j] = get(s, i, j);
    
    // 初始状态：0 个数字分成 0 段，乘积为 1
    dp[0][0] = Big(1);
    vis[0][0] = 1;
    
    // DP 转移：枚举前 i 个数字分成 j 段
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= k + 1; j++)
        {
            if (i < j) continue;  // i 个数字至少要 j 个才能分 j 段
            // 枚举最后一段的起点 p
            for (int p = j - 1; p < i; p++)
            {
                if (!vis[p][j - 1]) continue;
                // 转移：dp[p][j-1] * num[p][i]
                Big t = dp[p][j - 1] * num[p][i];
                if (!vis[i][j] || t > dp[i][j])
                    dp[i][j] = t, vis[i][j] = 1;
            }
        }
    
    // 输出答案：前 n 个数字分成 k+1 段
    dp[n][k + 1].print();
    cout << '\n';
}