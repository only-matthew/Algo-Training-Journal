#include <bits/stdc++.h>
using namespace std;
int main()
{
    int n;
    cin>>n;
    vector<int> a(1001,1);
    for(int i=1;i<=n;i++)
    {
        for(int j=1;j<=i/2;j++)
        {
            a[i]+=a[j];
        }
    }
    cout<<a[n];
}