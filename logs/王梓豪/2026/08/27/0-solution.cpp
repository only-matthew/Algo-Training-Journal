#include <bits/stdc++.h>
using namespace std;

string pre[25];

string add(string a, string b)
{
    int carry = 0;
    string ans;
    int i = (int)a.size() - 1;
    int j = (int)b.size() - 1;
    while (i >= 0 || j >= 0 || carry)
    {
        int x = (i >= 0 ? a[i] - '0' : 0);
        int y = (j >= 0 ? b[j] - '0' : 0);
        int sum = x + y + carry;

        ans += char(sum % 10 + '0');
        carry = sum / 10;

        i--;
        j--;
    }

    reverse(ans.begin(), ans.end());
    if (ans.size() > 500)
        ans = ans.substr(ans.size() - 500);

    return ans;
}
string mutiply1(string a, int b)
{
    if (b == 0)
        return "0";
    int carry = 0;
    string ans;
    for (int i = (int)a.size() - 1; i >= 0; i--)
    {
        int sum = (a[i] - '0') * b + carry;
        ans += char(sum % 10 + '0');
        carry = sum / 10;
    }
    while (carry)
    {
        ans += char(carry % 10 + '0');
        carry /= 10;
    }
    reverse(ans.begin(), ans.end());
    if (ans.size() > 500)
        ans = ans.substr(ans.size() - 500);

    return ans;
}

string mutiply2(string a, string b)
{
    string ans = "0";
    for (int i = (int)a.size() - 1; i >= 0; i--)
    {
        int x = a[i] - '0';
        if (x == 0)
            continue;
        string temp = mutiply1(b, x);
        temp += string(a.size() - 1 - i, '0');
        if (temp.size() > 500)
            temp = temp.substr(temp.size() - 500);

        ans = add(ans, temp);
    }

    return ans;
}
string minus1(string a)
{
    for (int i =a.size() - 1; i >= 0; i--)
    {
        if (a[i] > '0')
        {
            a[i]--;
            break;
        }
        a[i] = '9';
    }
    int pos = 0;
    while (pos+1<a.size()&&a[pos]=='0')
        pos++;
    return a.substr(pos);
}
string solve(string a, int m)
{
    if (m == 0)
        return "1";
    if (m == 1)
        return a;
    string temp = solve(a, m / 2);
    temp = mutiply2(temp, temp);
    if (m % 2 == 1)
        temp = mutiply2(temp, a);

    return temp;
}

int main()
{
    int n;
    cin >> n;

    
        // k - 1 <= log10(x) < k
        // 2^n 的位数 = floor(n * log10(2)) + 1。
        // log10(2^n) = n * log10(2)
    
    int digits = (int)(n * log10(2.0)) + 1;
    cout << digits << '\n';
    string ans = solve("2", n);
    ans = minus1(ans);
    ans = string(500 - ans.size(), '0') + ans;
    for (int i = 0; i < 500; i += 50)
        cout << ans.substr(i, 50) <<endl;

    return 0;
}