#include<iostream>
#include<cmath>
#include<algorithm>
using namespace std;
int s[20],b[20];
int main()
{
    int n;cin>>n;
    for(int i=0;i<n;i++)cin>>s[i]>>b[i];
    int mini=1000000000;
    int m=pow(2,n);
    for(int i=1;i<m;i++)
    {
        int suan=1,ku=0;
        for(int j=0;j<n;j++)
        {
            int p=pow(2,j);
            if(i/p%2==1)
            {
                suan*=s[j];
                ku+=b[j];
            }
        }
        mini=min(mini,abs(suan-ku));
    }
    cout<<mini<<endl;
    return 0;
}