#include <bits/stdc++.h>
using namespace std;

int main()
{
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    vector<int> a(n);
    for (int i = 0; i < n; i++)
    {
        cin >> a[i];
    }
    vector<int> big(n);
    big[n - 1] = a[n - 1];
    for (int i = n - 2; i >= 0; i--)
    {
        big[i] = min(big[i + 1], a[i]);
    }
    vector<int> w(n);
    for (int i = 0; i < n; i++)
    {
        cin >> w[i];
    }

    vector<long long> arr(n);
    arr[n - 1] = w[n - 1];
    for (int i = n - 2; i >= 0; i--)
    {
        arr[i] = arr[i + 1] + w[i];
    }
    long long total = 0;
    long long num = LLONG_MIN;
    for (int i = n - 1; i >= 0;)
    {
        int now = big[i];
        while (i >= 0 && big[i] == now)
        {
            num = max(num, arr[i]);
            i--;
        }
        long long next = (i >= 0 ? big[i] : 0);
        if (num > 0)
        {
            total += num * (now - next);
        }
    }
    cout << total << '\n';
    return 0;
}